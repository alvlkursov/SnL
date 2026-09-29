import type { Signal } from "../types.js";
import type { SimResult } from "./simulate.js";

export interface Row {
  messageId: number;
  date: Date;
  signal: Signal;
  symbol?: string;
  result: SimResult;
}

export interface Summary {
  signals: number;
  traded: number;
  skipped: number;
  noFill: number;
  wins: number;
  losses: number;
  timeouts: number;
  breakevens: number;
  winRate: number;
  /** Win rate needed to break even given the average win and loss sizes. */
  breakEvenWinRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number;
  maxDrawdownPct: number;
  finalEquityPct: number;
  channelLiquidations: number;
}

export function summarize(rows: Row[], riskPct: number): Summary {
  const traded = rows.filter((r) => r.result.r !== undefined);
  const byExit = [...traded].sort((a, b) => a.result.exitTime! - b.result.exitTime!);
  const rs = traded.map((r) => r.result.r!);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? -losses.reduce((a, b) => a + b, 0) / losses.length : 0;

  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const row of byExit) {
    equity *= 1 + (row.result.r! * riskPct) / 100;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
  }

  const totalR = rs.reduce((a, b) => a + b, 0);
  return {
    signals: rows.length,
    traded: traded.length,
    skipped: rows.filter((r) => r.result.outcome === "skipped").length,
    noFill: rows.filter((r) => r.result.outcome === "no_fill").length,
    wins: traded.filter((r) => r.result.outcome === "target").length,
    losses: traded.filter((r) => r.result.outcome === "stop").length,
    timeouts: traded.filter((r) => r.result.outcome === "timeout").length,
    breakevens: traded.filter((r) => r.result.outcome === "breakeven").length,
    winRate: traded.length ? wins.length / traded.length : 0,
    breakEvenWinRate: avgWin + avgLoss > 0 ? avgLoss / (avgWin + avgLoss) : 0,
    avgR: traded.length ? totalR / traded.length : 0,
    totalR,
    profitFactor: avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : Infinity,
    maxDrawdownPct: maxDd * 100,
    finalEquityPct: (equity - 1) * 100,
    channelLiquidations: traded.filter((r) => r.result.channelLiquidated).length,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatSummary(title: string, s: Summary, riskPct: number): string {
  return [
    `── ${title} ──`,
    `Сигналов: ${s.signals}   сделок: ${s.traded}   пропущено: ${s.skipped}   не исполнено: ${s.noFill}`,
    `Тейк: ${s.wins}   стоп: ${s.losses}   безубыток: ${s.breakevens}   по таймауту: ${s.timeouts}`,
    `Винрейт: ${pct(s.winRate)}   нужно для безубытка: ${pct(s.breakEvenWinRate)}`,
    `Средний результат: ${s.avgR.toFixed(3)}R   сумма: ${s.totalR.toFixed(2)}R   profit factor: ${s.profitFactor.toFixed(2)}`,
    `При риске ${riskPct}% на сделку: итог ${s.finalEquityPct.toFixed(1)}%, макс. просадка ${s.maxDrawdownPct.toFixed(1)}%`,
    `С плечом из канала позиция была бы ликвидирована до стопа: ${s.channelLiquidations} раз`,
  ].join("\n");
}

export function groupBy<K extends string>(rows: Row[], key: (r: Row) => K): Map<K, Row[]> {
  const m = new Map<K, Row[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

export function toCsv(rows: Row[]): string {
  const head = [
    "message_id",
    "date",
    "coin",
    "symbol",
    "side",
    "leverage_channel",
    "entry_low",
    "entry_high",
    "target",
    "stop",
    "trade_type",
    "outcome",
    "reason",
    "entry_type",
    "entry",
    "exit",
    "exit_time",
    "r",
    "move_pct",
    "leverage_used",
    "channel_liquidated",
  ];
  const lines = rows.map(({ messageId, date, signal: s, symbol, result: r }) =>
    [
      messageId,
      date.toISOString(),
      s.coin,
      symbol ?? "",
      s.side,
      s.leverage ?? "",
      s.entryLow,
      s.entryHigh,
      s.targets[0],
      s.stop,
      s.tradeType ?? "",
      r.outcome,
      r.reason ?? "",
      r.entryType ?? "",
      r.entry ?? "",
      r.exit ?? "",
      r.exitTime ? new Date(r.exitTime).toISOString() : "",
      r.r?.toFixed(4) ?? "",
      r.movePct?.toFixed(3) ?? "",
      r.leverage ?? "",
      r.channelLiquidated ?? "",
    ]
      .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
      .join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}
