import { RestClientV5 } from "bybit-api";
import { Market, roundPrice, roundQty, scaleSignal, unwrap } from "./bybit/market.js";
import type { LiveConfig } from "./config.js";
import type { Notifier } from "./notify.js";
import { parseSignal } from "./parser.js";
import type { Store, Trade } from "./store.js";
import { chooseLeverage, decideEntry, filterReason, positionSize, rewardRisk } from "./strategy.js";
import type { ChannelMessage } from "./types.js";

const CATEGORY = "linear" as const;
/** Bybit: "leverage not modified" — already set to the requested value. */
const LEVERAGE_NOT_MODIFIED = 110043;

export class Bot {
  private readonly client: RestClientV5;
  private readonly market: Market;
  private queue = Promise.resolve();

  constructor(
    private readonly cfg: LiveConfig,
    private readonly store: Store,
    private readonly notifier: Notifier,
  ) {
    this.client = new RestClientV5({
      key: cfg.BYBIT_API_KEY || undefined,
      secret: cfg.BYBIT_API_SECRET || undefined,
      testnet: cfg.BYBIT_ENV === "testnet",
      demoTrading: cfg.BYBIT_ENV === "demo",
    });
    // Market data always comes from mainnet: demo trades at mainnet prices, testnet has its own.
    this.market = new Market(cfg.BYBIT_ENV === "testnet" ? this.client : new RestClientV5());
  }

  /** Messages are handled one at a time so position limits can't be raced. */
  handle(msg: ChannelMessage, edited: boolean): Promise<void> {
    this.queue = this.queue
      .then(() => this.process(msg, edited))
      .catch(async (err: unknown) => {
        await this.notifier.send(`❌ Ошибка при обработке #${msg.id}: ${(err as Error).message}`);
      });
    return this.queue;
  }

  private async process(msg: ChannelMessage, edited: boolean): Promise<void> {
    const parsed = parseSignal(msg.text);
    if (this.store.isProcessed(msg.id)) {
      if (edited && parsed.kind === "signal")
        await this.notifier.send(`✏️ Сигнал #${msg.id} отредактирован после обработки, проверьте вручную`);
      return;
    }

    if (parsed.kind === "other") {
      // Likely a follow-up like "закрываем TRUMP": relay it if it mentions a coin we hold.
      const hit = this.store.active().find((t) => msg.text.toUpperCase().includes(t.symbol.replace(/^\d+|USDT$/g, "")));
      if (hit) await this.notifier.send(`💬 В канале про ${hit.symbol}:\n${msg.text.slice(0, 500)}`);
      return;
    }

    const skip = async (reason: string) => {
      await this.store.markProcessed(msg.id, `skip: ${reason}`);
      await this.notifier.send(`⏭ #${msg.id} пропущен: ${reason}`);
    };

    const ageSec = (Date.now() - msg.date.getTime()) / 1000;
    if (ageSec > this.cfg.MAX_SIGNAL_AGE_SEC) return skip(`сообщение устарело (${Math.round(ageSec)} с)`);
    if (parsed.kind === "invalid") return skip(`не распознан: ${parsed.reason}`);

    const raw = parsed.signal;
    const filtered = filterReason(raw, this.cfg);
    if (filtered) return skip(filtered);
    const active = this.store.active();
    if (active.length >= this.cfg.MAX_OPEN_POSITIONS) return skip(`уже ${active.length} активных сделок`);

    const resolved = await this.market.resolve(raw.coin, raw, (s) => this.market.lastPrice(s));
    if ("error" in resolved) return skip(resolved.error);
    const { symbol, instrument } = resolved;
    if (active.some((t) => t.symbol === symbol)) return skip(`по ${symbol} уже есть сделка`);

    const signal = scaleSignal(raw, resolved.multiplier);
    const price = (await this.market.lastPrice(symbol))!;
    const decision = decideEntry(signal, price, this.cfg);
    if (decision.action === "skip") return skip(decision.reason);

    const { equity, available } = await this.balance();
    const dayStart = await this.store.dayStartEquity(equity);
    if (equity < dayStart * (1 - this.cfg.MAX_DAILY_LOSS_PCT / 100)) {
      return skip(`дневной лимит убытка: ${equity.toFixed(2)} из ${dayStart.toFixed(2)} USDT`);
    }

    const entry = decision.price;
    const leverage = chooseLeverage(signal, entry, this.cfg, Number(instrument.leverageFilter.maxLeverage));
    const byRisk = positionSize(equity, entry, signal.stop, this.cfg);
    const byMargin = (available * (this.cfg.MAX_MARGIN_PCT / 100) * leverage) / entry;
    const qty = roundQty(instrument, Math.min(byRisk, byMargin));
    const notional = Number(qty) * entry;
    if (
      Number(qty) < Number(instrument.lotSizeFilter.minOrderQty) ||
      notional < Number(instrument.lotSizeFilter.minNotionalValue ?? 0)
    ) {
      return skip(`объём ${qty} меньше минимального для ${symbol}`);
    }

    const target = roundPrice(instrument, signal.targets[0]!);
    const stop = roundPrice(instrument, signal.stop);
    const entryStr = roundPrice(instrument, entry);
    const riskUsd = Number(qty) * Math.abs(entry - signal.stop);
    const plan =
      `${signal.side === "long" ? "🟢 LONG" : "🔴 SHORT"} ${symbol} #${msg.id}\n` +
      `${decision.action === "market" ? "Рынок" : "Лимит"} ${entryStr}, объём ${qty} (${notional.toFixed(2)} USDT), плечо ${leverage}x` +
      (raw.leverage && raw.leverage !== leverage ? ` (в канале ${raw.leverage}x)` : "") +
      `\nTP ${target}  SL ${stop}  R:R ${rewardRisk(signal, entry).toFixed(2)}  риск ≈ ${riskUsd.toFixed(2)} USDT`;

    if (this.cfg.DRY_RUN) {
      await this.store.markProcessed(msg.id, "dry-run");
      await this.notifier.send(`🧪 DRY RUN\n${plan}`);
      return;
    }

    const lev = await this.client.setLeverage({
      category: CATEGORY,
      symbol,
      buyLeverage: String(leverage),
      sellLeverage: String(leverage),
    });
    if (lev.retCode !== 0 && lev.retCode !== LEVERAGE_NOT_MODIFIED)
      throw new Error(`setLeverage: ${lev.retCode} ${lev.retMsg}`);

    const orderLinkId = `sig-${msg.id}`;
    // Mark first: if we crash after the order is sent we must not send it again on restart.
    await this.store.markProcessed(msg.id, `order ${orderLinkId}`);
    unwrap(
      await this.client.submitOrder({
        category: CATEGORY,
        symbol,
        side: signal.side === "long" ? "Buy" : "Sell",
        orderType: decision.action === "market" ? "Market" : "Limit",
        price: decision.action === "limit" ? entryStr : undefined,
        timeInForce: decision.action === "limit" ? "GTC" : undefined,
        qty,
        positionIdx: 0,
        orderLinkId,
        takeProfit: target,
        stopLoss: stop,
        tpslMode: "Full",
        tpTriggerBy: "LastPrice",
        slTriggerBy: "LastPrice",
      }),
      "submitOrder",
    );
    const now = Date.now();
    await this.store.addTrade({
      messageId: msg.id,
      symbol,
      side: signal.side,
      qty,
      entry: entryStr,
      stop,
      target,
      leverage,
      orderLinkId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await this.notifier.send(`✅ Ордер отправлен\n${plan}`);
  }

  private async balance(): Promise<{ equity: number; available: number }> {
    if (this.cfg.DRY_RUN) return { equity: this.cfg.DRY_RUN_EQUITY, available: this.cfg.DRY_RUN_EQUITY };
    const res = unwrap(await this.client.getWalletBalance({ accountType: "UNIFIED", coin: "USDT" }), "wallet");
    const acc = res.list[0];
    if (!acc) throw new Error("no UNIFIED account");
    return { equity: Number(acc.totalEquity), available: Number(acc.totalAvailableBalance) };
  }

  /** Reconciles stored trades with the exchange: fills, timeouts, closes. Safe to call repeatedly. */
  async monitor(): Promise<void> {
    if (this.cfg.DRY_RUN) return;
    for (const t of this.store.active()) {
      try {
        await this.check(t);
      } catch (err) {
        console.error(`monitor ${t.symbol}`, err);
      }
    }
  }

  private async check(t: Trade): Promise<void> {
    const positions = unwrap(await this.client.getPositionInfo({ category: CATEGORY, symbol: t.symbol }), "positions");
    const pos = positions.list.find((p) => Number(p.size) > 0);

    if (t.status === "open") {
      if (pos) return;
      const pnl = await this.closedPnl(t);
      await this.store.updateTrade(t.orderLinkId, { status: "closed", pnl });
      await this.notifier.send(
        `${pnl >= 0 ? "💰" : "🔻"} ${t.symbol} закрыта: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT`,
      );
      return;
    }

    // pending
    if (pos) {
      await this.store.updateTrade(t.orderLinkId, { status: "open" });
      await this.notifier.send(
        `📥 ${t.symbol} вход исполнен: ${pos.size} по ${pos.avgPrice}, ликвидация ${pos.liqPrice || "—"}`,
      );
      return;
    }
    const open = unwrap(
      await this.client.getActiveOrders({ category: CATEGORY, symbol: t.symbol, orderLinkId: t.orderLinkId }),
      "orders",
    ).list[0];
    if (!open) {
      // Not resting and no position: rejected, cancelled elsewhere, or filled and already closed.
      const hist = unwrap(
        await this.client.getHistoricOrders({ category: CATEGORY, symbol: t.symbol, orderLinkId: t.orderLinkId }),
        "history",
      ).list[0];
      if (hist?.orderStatus === "Filled") {
        const pnl = await this.closedPnl(t);
        await this.store.updateTrade(t.orderLinkId, { status: "closed", pnl });
        await this.notifier.send(`${t.symbol} исполнена и уже закрыта: ${pnl.toFixed(2)} USDT`);
      } else {
        await this.store.updateTrade(t.orderLinkId, { status: "cancelled" });
        await this.notifier.send(
          `🚫 ${t.symbol} ордер не активен (${hist?.orderStatus ?? "не найден"}${hist?.rejectReason ? `, ${hist.rejectReason}` : ""})`,
        );
      }
      return;
    }

    const price = await this.market.lastPrice(t.symbol);
    const pastTarget =
      price !== undefined && (t.side === "long" ? price >= Number(t.target) : price <= Number(t.target));
    const expired = Date.now() - t.createdAt > this.cfg.ENTRY_TIMEOUT_MIN * 60_000;
    if (!pastTarget && !expired) return;
    unwrap(
      await this.client.cancelOrder({ category: CATEGORY, symbol: t.symbol, orderLinkId: t.orderLinkId }),
      "cancel",
    );
    await this.store.updateTrade(t.orderLinkId, { status: "cancelled" });
    await this.notifier.send(
      `⌛ ${t.symbol} лимитный вход отменён: ${pastTarget ? "цена дошла до цели без нас" : "таймаут"}`,
    );
  }

  private async closedPnl(t: Trade): Promise<number> {
    const res = unwrap(
      await this.client.getClosedPnL({ category: CATEGORY, symbol: t.symbol, startTime: t.createdAt, limit: 50 }),
      "closedPnl",
    );
    return res.list.reduce((sum, p) => sum + Number(p.closedPnl), 0);
  }
}
