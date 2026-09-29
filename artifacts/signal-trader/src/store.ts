import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Side } from "./types.js";

export type TradeStatus = "pending" | "open" | "closed" | "cancelled";

export interface Trade {
  messageId: number;
  symbol: string;
  side: Side;
  qty: string;
  entry: string;
  stop: string;
  target: string;
  leverage: number;
  orderLinkId: string;
  status: TradeStatus;
  createdAt: number;
  updatedAt: number;
  pnl?: number;
  /** Stop already moved to entry. */
  breakeven?: boolean;
}

interface State {
  /** Channel message id → what we did with it; guarantees a post is acted on once. */
  processed: Record<string, string>;
  trades: Trade[];
  day?: { date: string; equity: number };
}

/** Small JSON-file store; enough for one bot process. */
export class Store {
  private state: State = { processed: {}, trades: [] };

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      this.state = JSON.parse(await readFile(this.file, "utf8")) as State;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2));
    await rename(tmp, this.file);
  }

  isProcessed(messageId: number): boolean {
    return String(messageId) in this.state.processed;
  }

  async markProcessed(messageId: number, note: string): Promise<void> {
    this.state.processed[String(messageId)] = note;
    await this.save();
  }

  active(): Trade[] {
    return this.state.trades.filter((t) => t.status === "pending" || t.status === "open");
  }

  async addTrade(t: Trade): Promise<void> {
    this.state.trades.push(t);
    await this.save();
  }

  async updateTrade(orderLinkId: string, patch: Partial<Trade>): Promise<void> {
    const t = this.state.trades.find((x) => x.orderLinkId === orderLinkId);
    if (!t) return;
    Object.assign(t, patch, { updatedAt: Date.now() });
    await this.save();
  }

  /** Equity at the first check of the current UTC day. */
  async dayStartEquity(current: number): Promise<number> {
    const date = new Date().toISOString().slice(0, 10);
    if (this.state.day?.date !== date) {
      this.state.day = { date, equity: current };
      await this.save();
    }
    return this.state.day.equity;
  }
}
