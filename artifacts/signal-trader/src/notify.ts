/** Sends status messages to you through a regular Telegram bot (create one with @BotFather). */
export class Notifier {
  constructor(
    private readonly token?: string,
    private readonly chatId?: string,
  ) {}

  async send(text: string): Promise<void> {
    console.log(`[notify] ${text}`);
    if (!this.token || !this.chatId) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text, disable_web_page_preview: true }),
      });
      if (!res.ok) console.error(`notify failed: HTTP ${res.status}`);
    } catch (err) {
      console.error("notify failed", err);
    }
  }
}
