import type { ParseResult, Side, Signal } from "./types.js";

// Format of https://t.me/hardcoretrading posts:
//
//   📈 SHORT
//   ▪️Монета: TRUMP
//   ▪️Плечо: 10х
//   ▪️Вход: от 2.078 до 2.034
//   ▪️Цель: 2.006
//   ▪️Стоп: 2.14
//   ⏰Тип сделки: среднесрок

const NUM = String.raw`\d+(?:[.,]\d+)?`;

const SIDE_RE = /(?:^|[^A-Za-zА-Яа-я])(LONG|SHORT|ЛОНГ|ШОРТ)(?![A-Za-zА-Яа-я])/i;
const COIN_RE = /Монета\s*:\s*#?\$?([A-Za-z0-9]+)(?:\s*\/\s*USDT)?/i;
const LEVERAGE_RE = /Плечо\s*:\s*(\d+)\s*[xхXХ]?/i;
const ENTRY_RE = new RegExp(String.raw`Вход\s*:\s*(?:от\s*)?(${NUM})(?:\s*(?:до|-|–|—)\s*(${NUM}))?`, "i");
const TARGET_RE = /Цел[ьи]\s*:\s*([^\n]+)/i;
const STOP_RE = new RegExp(String.raw`Стоп\s*:\s*(${NUM})`, "i");
const TYPE_RE = /Тип сделки\s*:\s*([^\n]+)/i;

function num(s: string): number {
  return Number(s.replace(",", "."));
}

function normalize(text: string): string {
  return text.replace(/\r/g, "").replace(/[   ]/g, " ");
}

export function parseSignal(raw: string): ParseResult {
  const text = normalize(raw);
  const coinM = COIN_RE.exec(text);
  const sideM = SIDE_RE.exec(text);
  const entryM = ENTRY_RE.exec(text);
  const stopM = STOP_RE.exec(text);
  const targetM = TARGET_RE.exec(text);

  if (!coinM && !entryM && !stopM) return { kind: "other" };
  if (!coinM) return { kind: "invalid", reason: "no coin" };
  if (!sideM) return { kind: "invalid", reason: "no LONG/SHORT" };
  if (!entryM) return { kind: "invalid", reason: "no entry" };
  if (!stopM) return { kind: "invalid", reason: "no stop" };
  if (!targetM) return { kind: "invalid", reason: "no target" };

  const sideWord = sideM[1]!.toUpperCase();
  const side: Side = sideWord === "LONG" || sideWord === "ЛОНГ" ? "long" : "short";
  const e1 = num(entryM[1]!);
  const e2 = entryM[2] ? num(entryM[2]) : e1;
  const targets = [...targetM[1]!.matchAll(new RegExp(NUM, "g"))].map((m) => num(m[0]));
  const leverageM = LEVERAGE_RE.exec(text);

  const signal: Signal = {
    coin: coinM[1]!.toUpperCase().replace(/USDT$/, ""),
    side,
    leverage: leverageM ? Number(leverageM[1]) : undefined,
    entryLow: Math.min(e1, e2),
    entryHigh: Math.max(e1, e2),
    targets,
    stop: num(stopM[1]!),
    tradeType: normalizeTradeType(TYPE_RE.exec(text)?.[1]),
  };

  const reason = validate(signal);
  return reason ? { kind: "invalid", reason } : { kind: "signal", signal };
}

/**
 * "краткосрок", "среднесрок" or both joined with ", ". The channel sometimes adds a sentence
 * after the type or misspells it ("красткосрок").
 */
function normalizeTradeType(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  const types = [
    /кра\S*ткосроч?/.test(t) && "краткосрок",
    /среднесроч?/.test(t) && "среднесрок",
    /долгосроч?/.test(t) && "долгосрок",
  ];
  const found = types.filter((x): x is string => Boolean(x));
  return found.length ? found.join(", ") : t.trim();
}

export function validate(s: Signal): string | undefined {
  const all = [s.entryLow, s.entryHigh, s.stop, ...s.targets];
  if (all.some((v) => !Number.isFinite(v) || v <= 0)) return "non-positive price";
  if (s.targets.length === 0) return "no target";
  if (s.side === "long") {
    if (s.stop >= s.entryLow) return "long: stop must be below entry";
    if (s.targets.some((t) => t <= s.entryHigh)) return "long: target must be above entry";
  } else {
    if (s.stop <= s.entryHigh) return "short: stop must be above entry";
    if (s.targets.some((t) => t >= s.entryLow)) return "short: target must be below entry";
  }
  // Guards against typos like a missing zero (0.0983 instead of 0.00983).
  if (Math.abs(s.stop - s.entryHigh) / s.entryHigh > 0.5) return "stop is >50% away from entry";
  return undefined;
}
