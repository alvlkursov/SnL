import { pickSymbol } from "../bybit/market.js";
import type { Candle, Signal } from "../types.js";

/**
 * Binance spot candles from the public market-data endpoint. Used by the backtest where Bybit
 * is unreachable (Bybit geo-blocks some regions); spot tracks the perpetual closely.
 */
export class BinanceSpot {
  private symbols?: Set<string>;

  constructor(private readonly base = "https://data-api.binance.vision") {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) throw new Error(`Binance ${path}: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async resolve(coin: string, signal: Signal, priceAt: (symbol: string) => Promise<number | undefined>) {
    if (!this.symbols) {
      const info = await this.get<{ symbols: Array<{ symbol: string; quoteAsset: string }> }>(
        "/api/v3/exchangeInfo?permissions=SPOT",
      );
      // Delisted pairs are kept on purpose: their history is still served and old signals need it.
      this.symbols = new Set(info.symbols.filter((s) => s.quoteAsset === "USDT").map((s) => s.symbol));
    }
    return pickSymbol(coin, signal, this.symbols, priceAt, "USDT pair on Binance spot");
  }

  async candles(symbol: string, intervalMin: number, start: number, end: number): Promise<Candle[]> {
    const out: Candle[] = [];
    let from = start;
    while (from < end) {
      const rows = await this.get<Array<[number, string, string, string, string]>>(
        `/api/v3/klines?symbol=${symbol}&interval=${intervalMin}m&startTime=${from}&endTime=${end - 1}&limit=1000`,
      );
      if (rows.length === 0) break;
      out.push(...rows.map(([t, o, h, l, c]) => ({ start: t, open: +o, high: +h, low: +l, close: +c })));
      from = rows[rows.length - 1]![0] + intervalMin * 60_000;
    }
    return out;
  }
}
