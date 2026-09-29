export type Side = "long" | "short";

/** A trade signal as published in the channel, in the channel's own prices. */
export interface Signal {
  coin: string;
  side: Side;
  leverage?: number;
  /** Lower and upper bound of the entry zone. */
  entryLow: number;
  entryHigh: number;
  targets: number[];
  stop: number;
  tradeType?: string;
}

export type ParseResult = { kind: "signal"; signal: Signal } | { kind: "invalid"; reason: string } | { kind: "other" };

export interface ChannelMessage {
  id: number;
  date: Date;
  text: string;
}

export interface Candle {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
}
