// Downloads the channel history from the public web preview and prints signal statistics
// that don't need prices. The JSON is in Telegram Desktop export format, so it can be fed to
// `pnpm backtest --source export --file <it>` later (e.g. on a machine where Bybit is reachable).
//
//   pnpm history --days 180 --out data/history.json
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { fetchWebHistory } from "../backtest/sources.js";
import { parseSignal } from "../parser.js";
import { rewardRisk } from "../strategy.js";
import type { Signal } from "../types.js";

const { values: args } = parseArgs({
  options: {
    channel: { type: "string", default: process.env.TG_CHANNEL ?? "hardcoretrading" },
    days: { type: "string", default: "180" },
    out: { type: "string", default: "data/history.json" },
  },
});

const since = new Date(Date.now() - Number(args.days) * 86_400_000);
const messages = await fetchWebHistory(args.channel!, {
  since,
  onPage: (n, oldest) => process.stdout.write(`\rстраница ${n}, до ${oldest?.toISOString().slice(0, 10)}`),
});
await mkdir(dirname(args.out!), { recursive: true });
await writeFile(
  args.out!,
  JSON.stringify(
    {
      name: args.channel,
      messages: messages.map((m) => ({
        id: m.id,
        type: "message",
        date: m.date.toISOString(),
        date_unixtime: String(Math.floor(m.date.getTime() / 1000)),
        text: m.text,
      })),
    },
    null,
    1,
  ),
);

const signals: Array<{ id: number; date: Date; s: Signal }> = [];
const invalid: Array<{ id: number; reason: string; text: string }> = [];
for (const m of messages) {
  const p = parseSignal(m.text);
  if (p.kind === "signal") signals.push({ id: m.id, date: m.date, s: p.signal });
  if (p.kind === "invalid") invalid.push({ id: m.id, reason: p.reason, text: m.text });
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)]! : NaN;
};
const count = <T>(xs: T[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())];
const days = (Date.now() - (messages[0]?.date.getTime() ?? Date.now())) / 86_400_000;

console.log(`\n\nСообщений: ${messages.length} за ${days.toFixed(0)} дн. → ${args.out}`);
console.log(
  `Сигналов: ${signals.length} (≈ ${((signals.length / Math.max(days, 1)) * 7).toFixed(1)} в неделю), не распознано похожих: ${invalid.length}`,
);
console.log("По сторонам:", Object.fromEntries(count(signals.map((x) => x.s.side))));
console.log("По типу:", Object.fromEntries(count(signals.map((x) => x.s.tradeType ?? "не указан"))));

const mid = (s: Signal) => (s.entryLow + s.entryHigh) / 2;
const rrMid = signals.map((x) => rewardRisk(x.s.targets[0]!, x.s.stop, mid(x.s)));
const stopPct = signals.map((x) => (Math.abs(mid(x.s) - x.s.stop) / mid(x.s)) * 100);
const targetPct = signals.map((x) => (Math.abs(x.s.targets[0]! - mid(x.s)) / mid(x.s)) * 100);
const lev = signals.map((x) => x.s.leverage ?? NaN).filter(Number.isFinite);
console.log(
  `Медиана: цель ${median(targetPct).toFixed(2)}% от середины зоны, стоп ${median(stopPct).toFixed(2)}%, R:R ${median(rrMid).toFixed(2)}`,
);
console.log(`→ для безубытка нужен винрейт ≈ ${((1 / (1 + median(rrMid))) * 100).toFixed(0)}% (без комиссий)`);
console.log(`Плечо в канале: медиана ${median(lev)}x, максимум ${Math.max(...lev)}x`);
const liqFirst = signals.filter(
  (x) => x.s.leverage && 1 / x.s.leverage - 0.01 < Math.abs(mid(x.s) - x.s.stop) / mid(x.s),
);
console.log(`Сигналов, где плечо канала ликвидирует раньше стопа: ${liqFirst.length} из ${signals.length}`);

if (invalid.length) {
  console.log("\nПохожи на сигнал, но не распознаны:");
  for (const i of invalid.slice(0, 10))
    console.log(`  #${i.id} (${i.reason}): ${i.text.replace(/\n+/g, " | ").slice(0, 160)}`);
}
