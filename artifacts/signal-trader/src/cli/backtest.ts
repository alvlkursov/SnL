// Replays the channel's history on Bybit candles.
//
//   pnpm backtest --source web --days 180            # public channel, no login
//   pnpm backtest --source telegram --days 180       # via your session (TG_* in .env)
//   pnpm backtest --source export --file result.json # Telegram Desktop export or `pnpm history` output
//   add --prices binance where Bybit is geo-blocked (spot prices from data-api.binance.vision)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Market, scaleSignal } from "../bybit/market.js";
import { BinanceSpot } from "../backtest/binance.js";
import { loadStrategyConfig } from "../config.js";
import { parseSignal } from "../parser.js";
import { filterReason } from "../strategy.js";
import type { Candle, ChannelMessage } from "../types.js";
import { formatSummary, groupBy, summarize, toCsv, type Row } from "../backtest/report.js";
import { simulate } from "../backtest/simulate.js";
import { fetchWebHistory, loadDesktopExport } from "../backtest/sources.js";

const { values: args } = parseArgs({
  options: {
    source: { type: "string", default: "web" },
    channel: { type: "string", default: process.env.TG_CHANNEL ?? "hardcoretrading" },
    file: { type: "string" },
    days: { type: "string", default: "180" },
    interval: { type: "string", default: "5" },
    // bybit = the exchange we trade on; binance = spot prices where Bybit is geo-blocked.
    prices: { type: "string", default: "bybit" },
    "hold-days": { type: "string", default: "7" },
    out: { type: "string", default: "data/backtest" },
  },
});

const cfg = loadStrategyConfig();
const since = new Date(Date.now() - Number(args.days) * 86_400_000);
const intervalMin = Number(args.interval);
const holdMs = Number(args["hold-days"]) * 86_400_000;
const cacheDir = "data/cache";
await mkdir(cacheDir, { recursive: true });
await mkdir(args.out!, { recursive: true });

async function loadMessages(): Promise<ChannelMessage[]> {
  switch (args.source) {
    case "web":
      return fetchWebHistory(args.channel!, {
        since,
        onPage: (n, oldest) => process.stdout.write(`\rстраница ${n}, до ${oldest?.toISOString().slice(0, 10)}`),
      });
    case "export":
      if (!args.file) throw new Error("--file is required for --source export");
      return loadDesktopExport(args.file, since);
    case "telegram": {
      const { connect, fetchHistory } = await import("../telegram/client.js");
      const client = await connect({
        apiId: Number(process.env.TG_API_ID),
        apiHash: process.env.TG_API_HASH ?? "",
        session: process.env.TG_SESSION ?? "",
      });
      try {
        return await fetchHistory(client, args.channel!, since);
      } finally {
        await client.disconnect();
      }
    }
    default:
      throw new Error(`unknown --source ${args.source}`);
  }
}

if (args.prices !== "bybit" && args.prices !== "binance") throw new Error("--prices must be bybit or binance");
const market = args.prices === "binance" ? new BinanceSpot() : new Market();

async function cachedCandles(symbol: string, start: number, end: number): Promise<Candle[]> {
  const file = join(cacheDir, `${args.prices}_${symbol}_${intervalMin}_${start}_${end}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as Candle[];
  } catch {
    const candles = await market.candles(symbol, intervalMin, start, end);
    // Only cache windows that are fully in the past.
    if (end < Date.now()) await writeFile(file, JSON.stringify(candles));
    return candles;
  }
}

async function main() {
  const messages = await loadMessages();
  console.log(`\nСообщений: ${messages.length} с ${since.toISOString().slice(0, 10)}`);

  const rows: Row[] = [];
  const invalid: Array<{ id: number; reason: string }> = [];
  for (const msg of messages) {
    const parsed = parseSignal(msg.text);
    if (parsed.kind === "invalid") invalid.push({ id: msg.id, reason: parsed.reason });
    if (parsed.kind !== "signal") continue;
    const signal = parsed.signal;
    const base = { messageId: msg.id, date: msg.date, signal };

    const filtered = filterReason(signal, cfg);
    if (filtered) {
      rows.push({ ...base, result: { outcome: "skipped", reason: filtered } });
      continue;
    }

    // Candles strictly after publication; we can't act on a candle that had already opened.
    const step = intervalMin * 60_000;
    const start = Math.ceil(msg.date.getTime() / step) * step;
    const end = Math.min(start + holdMs, Date.now());
    const resolved = await market.resolve(signal.coin, signal, async (symbol) => {
      const c = await cachedCandles(symbol, start, Math.min(start + step, end));
      return c[0]?.open;
    });
    if ("error" in resolved) {
      rows.push({ ...base, result: { outcome: "skipped", reason: resolved.error } });
      continue;
    }
    const candles = await cachedCandles(resolved.symbol, start, end);
    const result = simulate(scaleSignal(signal, resolved.multiplier), candles, cfg);
    rows.push({ ...base, symbol: resolved.symbol, result });
    process.stdout.write(`\r${rows.length} сигналов обработано`);
  }
  console.log("\n");

  if (invalid.length) {
    console.log(`Похожи на сигнал, но не распознаны (${invalid.length}), проверьте парсер:`);
    for (const i of invalid.slice(0, 20)) console.log(`  #${i.id}: ${i.reason}`);
    console.log();
  }

  console.log(formatSummary("Все сигналы", summarize(rows, cfg.RISK_PER_TRADE_PCT), cfg.RISK_PER_TRADE_PCT));
  for (const [key, group] of [
    ...groupBy(rows, (r) => r.signal.side),
    ...groupBy(rows, (r) => r.signal.tradeType ?? "тип не указан"),
    ...groupBy(rows, (r) => r.date.toISOString().slice(0, 7)),
  ]) {
    console.log();
    console.log(formatSummary(key, summarize(group, cfg.RISK_PER_TRADE_PCT), cfg.RISK_PER_TRADE_PCT));
  }

  await writeFile(join(args.out!, "trades.csv"), toCsv(rows));
  await writeFile(join(args.out!, "summary.json"), JSON.stringify(summarize(rows, cfg.RISK_PER_TRADE_PCT), null, 2));
  console.log(`\nПодробно по каждой сделке: ${join(args.out!, "trades.csv")}`);
}

main().catch((err: unknown) => {
  // bybit-api rejects with a plain object carrying `message`, not an Error.
  const e = err as { message?: string; code?: unknown };
  console.error(`\nОшибка: ${e?.message ?? String(err)}${e?.code ? ` (${String(e.code)})` : ""}`);
  process.exit(1);
});
