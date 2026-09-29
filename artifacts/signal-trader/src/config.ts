import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v?.toLowerCase() === "true");
const list = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : [],
  );

export const strategySchema = z.object({
  /** Share of equity lost if the stop is hit, in percent. */
  RISK_PER_TRADE_PCT: z.coerce.number().positive().max(10).default(1),
  /** Hard cap on leverage, whatever the channel says. */
  MAX_LEVERAGE: z.coerce.number().int().min(1).default(20),
  /** Liquidation must be at least this many times further than the stop. */
  LIQ_BUFFER: z.coerce.number().min(1).default(1.5),
  /** Skip signals whose reward:risk at our entry price is below this. */
  MIN_RR: z.coerce.number().min(0).default(0.3),
  /** Cancel a resting limit entry after this many minutes. */
  ENTRY_TIMEOUT_MIN: z.coerce.number().positive().default(240),
  TAKER_FEE_PCT: z.coerce.number().min(0).default(0.055),
  /** Only trade these trade types (e.g. "краткосрок"); empty = all. */
  TRADE_TYPES: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : [],
    ),
  COIN_BLACKLIST: list,
});

export type StrategyConfig = z.infer<typeof strategySchema>;

const liveSchema = strategySchema.extend({
  TG_API_ID: z.coerce.number().int().positive(),
  TG_API_HASH: z.string().min(1),
  TG_SESSION: z.string().min(1, "run `pnpm login` first and put the session into TG_SESSION"),
  TG_CHANNEL: z.string().default("hardcoretrading"),

  BYBIT_API_KEY: z.string().default(""),
  BYBIT_API_SECRET: z.string().default(""),
  /** demo = real prices, virtual money (recommended); testnet = separate illiquid market. */
  BYBIT_ENV: z.enum(["demo", "testnet", "mainnet"]).default("demo"),
  /** Parse and size signals, log what would be done, place no orders. */
  DRY_RUN: bool.default("true"),
  DRY_RUN_EQUITY: z.coerce.number().positive().default(1000),

  MAX_OPEN_POSITIONS: z.coerce.number().int().min(1).default(5),
  /** Stop opening new trades once equity is this far below the start of the UTC day. */
  MAX_DAILY_LOSS_PCT: z.coerce.number().positive().default(5),
  /** Never commit more than this share of available balance as margin to one trade. */
  MAX_MARGIN_PCT: z.coerce.number().positive().max(100).default(25),
  /** Ignore messages older than this (e.g. delivered after a reconnect). */
  MAX_SIGNAL_AGE_SEC: z.coerce.number().positive().default(180),

  NOTIFY_BOT_TOKEN: z.string().optional(),
  NOTIFY_CHAT_ID: z.string().optional(),
  STATE_FILE: z.string().default("data/state.json"),
});

export type LiveConfig = z.infer<typeof liveSchema>;

export function loadStrategyConfig(env = process.env): StrategyConfig {
  return strategySchema.parse(env);
}

export function loadLiveConfig(env = process.env): LiveConfig {
  const cfg = liveSchema.parse(env);
  if (!cfg.DRY_RUN && (!cfg.BYBIT_API_KEY || !cfg.BYBIT_API_SECRET)) {
    throw new Error("BYBIT_API_KEY and BYBIT_API_SECRET are required when DRY_RUN=false");
  }
  return cfg;
}
