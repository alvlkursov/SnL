import { readFile } from "node:fs/promises";
import type { ChannelMessage } from "../types.js";

// --- Public web preview (https://t.me/s/<channel>), works for public channels without login ---

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

export function parseWebPage(html: string): ChannelMessage[] {
  const out: ChannelMessage[] = [];
  // Every post starts with a wrapper carrying data-post="<channel>/<id>".
  const parts = html.split(/(?=<div class="tgme_widget_message_wrap)/);
  for (const part of parts) {
    const id = /data-post="[^"/]+\/(\d+)"/.exec(part)?.[1];
    const date = /<time[^>]*datetime="([^"]+)"/.exec(part)?.[1];
    const body = /<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/.exec(part)?.[1];
    if (!id || !date || body === undefined) continue;
    out.push({ id: Number(id), date: new Date(date), text: htmlToText(body).trim() });
  }
  return out;
}

export async function fetchWebHistory(
  channel: string,
  opts: { since: Date; maxPages?: number; onPage?: (n: number, oldest?: Date) => void },
): Promise<ChannelMessage[]> {
  const all = new Map<number, ChannelMessage>();
  let before: number | undefined;
  for (let page = 0; page < (opts.maxPages ?? 500); page++) {
    const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ""}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const msgs = parseWebPage(await res.text());
    if (msgs.length === 0) break;
    for (const m of msgs) all.set(m.id, m);
    const oldest = msgs.reduce((a, b) => (a.id < b.id ? a : b));
    opts.onPage?.(page + 1, oldest.date);
    if (oldest.date < opts.since || oldest.id === before) break;
    before = oldest.id;
  }
  return [...all.values()].filter((m) => m.date >= opts.since).sort((a, b) => a.id - b.id);
}

// --- Telegram Desktop: Settings → Advanced → Export chat history, format JSON ---

type ExportText = string | Array<string | { text: string }>;
interface DesktopExport {
  messages: Array<{ id: number; type: string; date: string; date_unixtime?: string; text: ExportText }>;
}

export async function loadDesktopExport(path: string, since: Date): Promise<ChannelMessage[]> {
  const data = JSON.parse(await readFile(path, "utf8")) as DesktopExport;
  return data.messages
    .filter((m) => m.type === "message")
    .map((m) => ({
      id: m.id,
      date: m.date_unixtime ? new Date(Number(m.date_unixtime) * 1000) : new Date(m.date),
      text: typeof m.text === "string" ? m.text : m.text.map((t) => (typeof t === "string" ? t : t.text)).join(""),
    }))
    .filter((m) => m.date >= since);
}
