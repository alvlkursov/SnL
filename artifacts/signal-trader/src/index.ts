import { Bot } from "./bot.js";
import { loadLiveConfig } from "./config.js";
import { Notifier } from "./notify.js";
import { Store } from "./store.js";
import { connect, onChannelMessage } from "./telegram/client.js";

const cfg = loadLiveConfig();
const store = new Store(cfg.STATE_FILE);
await store.load();
const notifier = new Notifier(cfg.NOTIFY_BOT_TOKEN, cfg.NOTIFY_CHAT_ID);
const bot = new Bot(cfg, store, notifier);

const tg = await connect({ apiId: cfg.TG_API_ID, apiHash: cfg.TG_API_HASH, session: cfg.TG_SESSION });
onChannelMessage(tg, cfg.TG_CHANNEL, (msg, edited) => bot.handle(msg, edited));

const MONITOR_MS = 30_000;
let stopping = false;
(async function loop() {
  while (!stopping) {
    await bot.monitor();
    await new Promise((r) => setTimeout(r, MONITOR_MS));
  }
})();

await notifier.send(
  `🤖 Бот запущен: канал @${cfg.TG_CHANNEL}, Bybit ${cfg.BYBIT_ENV}${cfg.DRY_RUN ? ", DRY RUN (ордера не отправляются)" : ""}, ` +
    `риск ${cfg.RISK_PER_TRADE_PCT}%, макс. плечо ${cfg.MAX_LEVERAGE}x`,
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    stopping = true;
    await tg.disconnect();
    process.exit(0);
  });
}
