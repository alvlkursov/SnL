// Searches execution rules (entry level, splitting, target/stop scaling, breakeven) on a backtest dataset.
// Picks on the first part of the history and reports the rest out-of-sample, to avoid fitting noise.
//
//   pnpm backtest ... --out data/bt      # writes data/bt/dataset.json
//   pnpm optimize --dataset data/bt/dataset.json --split 2026-03-28
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { runVariant, type DatasetEntry, type Variant } from "../backtest/variants.js";
import type { Candle } from "../types.js";

const { values: args } = parseArgs({
  options: {
    dataset: { type: "string", default: "data/backtest/dataset.json" },
    split: { type: "string" },
    fee: { type: "string", default: "0.055" },
    risk: { type: "string", default: "1" },
    top: { type: "string", default: "15" },
  },
});

const entries = JSON.parse(await readFile(args.dataset!, "utf8")) as DatasetEntry[];
const data = await Promise.all(
  entries.map(async (e) => ({
    ...e,
    t: Date.parse(e.date),
    k: JSON.parse(await readFile(e.candles, "utf8")) as Candle[],
  })),
);
data.sort((a, b) => a.t - b.t);
const split = args.split ? Date.parse(args.split) : data[Math.floor(data.length / 2)]!.t;
const fee = Number(args.fee);
const risk = Number(args.risk) / 100;

interface Stats {
  n: number;
  win: number;
  r: number;
  dd: number;
}

function evaluate(v: Variant, rows: typeof data): Stats {
  let n = 0;
  let win = 0;
  let r = 0;
  let eq = 1;
  let peak = 1;
  let dd = 0;
  for (const d of rows) {
    const res = runVariant(d.signal, d.k, v, fee);
    if (!res.filled) continue;
    n++;
    if (res.r > 0) win++;
    r += res.r;
    eq *= 1 + res.r * risk;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, 1 - eq / peak);
  }
  return { n, win: n ? win / n : 0, r, dd };
}

const grid: Variant[] = [];
for (const entryFrac of [0, 0.25, 0.5, 0.75, 1])
  for (const parts of entryFrac === 0 ? [1] : [1, 2, 3])
    for (const tpK of [0.5, 0.75, 1, 1.25, 1.5, 2])
      for (const slM of [0.5, 0.75, 1, 1.25])
        for (const beAt of [undefined, 0.5, 0.75])
          for (const entryTimeoutMin of entryFrac === 0 && parts === 1 ? [240] : [240, 1440])
            grid.push({ entryFrac, parts, tpK, slM, beAt, entryTimeoutMin });

const train = data.filter((d) => d.t < split);
const test = data.filter((d) => d.t >= split);
console.log(
  `Сигналов: ${data.length}; обучение до ${new Date(split).toISOString().slice(0, 10)}: ${train.length}, проверка: ${test.length}; вариантов: ${grid.length}`,
);

const minTrades = Math.max(20, Math.floor(train.length * 0.25));
const scored = grid
  .map((v) => ({ v, tr: evaluate(v, train) }))
  .filter((x) => x.tr.n >= minTrades)
  .sort((a, b) => b.tr.r - a.tr.r);

const label = (v: Variant) =>
  `вход ${v.entryFrac.toFixed(2)}${v.parts > 1 ? ` ×${v.parts} части` : ""}, цель ×${v.tpK}, стоп ×${v.slM}` +
  `${v.beAt ? `, б/у на ${v.beAt * 100}%` : ""}${v.entryFrac > 0 ? `, ждать ${v.entryTimeoutMin / 60}ч` : ""}`;
const fmt = (s: Stats) =>
  `${String(s.n).padStart(3)} сд., вин ${(s.win * 100).toFixed(0).padStart(2)}%, ${s.r >= 0 ? "+" : ""}${s.r.toFixed(1).padStart(5)}R, просадка ${(s.dd * 100).toFixed(1)}%`;

const baseline: Variant = { entryFrac: 0, parts: 1, tpK: 1, slM: 1, entryTimeoutMin: 240 };
console.log(`\nКак в канале:  обучение ${fmt(evaluate(baseline, train))} | проверка ${fmt(evaluate(baseline, test))}`);
console.log(`\nЛучшие на обучении → как они же прошли проверку:`);
for (const { v, tr } of scored.slice(0, Number(args.top))) {
  console.log(`  ${label(v).padEnd(70)} обуч. ${fmt(tr)} | пров. ${fmt(evaluate(v, test))}`);
}
