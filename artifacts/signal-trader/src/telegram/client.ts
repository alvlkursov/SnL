import { TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import { EditedMessage, type EditedMessageEvent } from "telegram/events/EditedMessage.js";
import { StringSession } from "telegram/sessions/index.js";
import type { ChannelMessage } from "../types.js";

export interface TgCredentials {
  apiId: number;
  apiHash: string;
  session: string;
}

export async function connect({ apiId, apiHash, session }: TgCredentials): Promise<TelegramClient> {
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 10 });
  client.setLogLevel("warn" as never);
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error("Telegram session is not authorized; run `pnpm login`");
  return client;
}

function toMessage(m: { id: number; date: number; message?: string }): ChannelMessage {
  return { id: m.id, date: new Date(m.date * 1000), text: m.message ?? "" };
}

/** Channel history since a date, oldest first. Works for private channels you are a member of. */
export async function fetchHistory(client: TelegramClient, channel: string, since: Date): Promise<ChannelMessage[]> {
  const out: ChannelMessage[] = [];
  for await (const m of client.iterMessages(channel, { limit: undefined })) {
    if (m.date * 1000 < since.getTime()) break;
    if (m.message) out.push(toMessage(m));
  }
  return out.reverse();
}

export function onChannelMessage(
  client: TelegramClient,
  channel: string,
  handler: (msg: ChannelMessage, edited: boolean) => Promise<void>,
) {
  const wrap = (edited: boolean) => async (e: NewMessageEvent | EditedMessageEvent) => {
    try {
      await handler(toMessage(e.message), edited);
    } catch (err) {
      console.error("handler failed", err);
    }
  };
  client.addEventHandler(wrap(false), new NewMessage({ chats: [channel] }));
  client.addEventHandler(wrap(true), new EditedMessage({ chats: [channel] }));
}
