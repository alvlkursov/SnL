import { describe, expect, it } from "vitest";
import { parseWebPage } from "../src/backtest/sources.js";

// Trimmed markup of https://t.me/s/<channel>.
const html = `
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="hardcoretrading/101" data-view="x">
<div class="tgme_widget_message_bubble">
<div class="tgme_widget_message_text js-message_text" dir="auto"><i class="emoji" style="background-image:url('x')"><b>📈</b></i> SHORT<br/><br/>▪️Монета: TRUMP<br/>▪️Вход: от 2.078 до 2.034<br/>▪️Цель: 2.006 &amp; more</div>
<div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/hardcoretrading/101"><time datetime="2025-09-01T10:15:00+00:00" class="time">10:15</time></a></div>
</div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="hardcoretrading/102">
<div class="tgme_widget_message_photo_wrap"></div>
<a class="tgme_widget_message_date"><time datetime="2025-09-01T11:00:00+00:00" class="time">11:00</time></a>
</div></div>`;

describe("parseWebPage", () => {
  it("extracts id, date and text, skipping posts without text", () => {
    expect(parseWebPage(html)).toEqual([
      {
        id: 101,
        date: new Date("2025-09-01T10:15:00Z"),
        text: "📈 SHORT\n\n▪️Монета: TRUMP\n▪️Вход: от 2.078 до 2.034\n▪️Цель: 2.006 & more",
      },
    ]);
  });
});
