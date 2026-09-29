// One-time interactive login with your own Telegram account. Prints a session string for TG_SESSION.
import { createInterface } from "node:readline/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH ?? "";
if (!apiId || !apiHash) {
  console.error("Set TG_API_ID and TG_API_HASH (from https://my.telegram.org → API development tools) in .env");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
await client.start({
  phoneNumber: () => rl.question("Телефон (+7...): "),
  phoneCode: () => rl.question("Код из Telegram: "),
  password: (hint) => rl.question(`Пароль 2FA${hint ? ` (${hint})` : ""}: `),
  onError: (err) => console.error(err.message),
});
console.log("\nДобавьте в .env (никому не показывайте — это полный доступ к аккаунту):\n");
console.log(`TG_SESSION=${String(client.session.save())}\n`);
rl.close();
await client.disconnect();
process.exit(0);
