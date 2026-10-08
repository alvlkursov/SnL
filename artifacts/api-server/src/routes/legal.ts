import { Router } from "express";
import { APP_NAME, CONTACT_EMAIL, POLICY_EFFECTIVE_DATE, PUBLISHER_NAME } from "../lib/legal.js";

// Public pages linked from the app and from the Google Play listing.
const router = Router();

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${APP_NAME}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0A0A0F; color: #F0F0FF; font: 16px/1.6 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 32px 0 8px; }
  .muted { color: #8888AA; font-size: 14px; }
  a { color: #FF5A3C; }
  ul { padding-left: 20px; }
  form { display: grid; gap: 12px; margin-top: 24px; background: #1C1C2E; padding: 20px; border-radius: 16px; border: 1px solid #2A2A40; }
  input { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid #2A2A40; background: #141420; color: #F0F0FF; }
  button { font: inherit; font-weight: 600; padding: 12px; border-radius: 10px; border: 0; background: #FF453A; color: #fff; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  #result { min-height: 1.6em; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const privacyHtml = page("Privacy Policy", `
<h1>Privacy Policy</h1>
<p class="muted">${APP_NAME} · Effective ${POLICY_EFFECTIVE_DATE}</p>

<p>${APP_NAME} ("the app") is an alarm clock that turns snoozing and missed alarms into charitable donations.
The app is published by ${PUBLISHER_NAME} ("we", "us"). This policy explains what data the app collects,
why, and how you can delete it.</p>

<h2>Data we collect</h2>
<ul>
  <li><b>Account data:</b> your name, email address and password. Passwords are stored only as a salted one-way hash.</li>
  <li><b>Alarm settings:</b> alarm times, repeat days, labels, donation amounts, chosen charity or charity category, confirmation method and snooze settings.</li>
  <li><b>Alarm activity:</b> when each alarm rang, whether you dismissed it, snoozed it or missed it, and your wake-up streak.</li>
  <li><b>Donation records:</b> the amount, charity and reason (snooze, missed alarm or voluntary) of each donation commitment.</li>
  <li><b>Time zone:</b> your device's time zone, so alarms are evaluated in your local time.</li>
</ul>
<p>We do <b>not</b> collect your location, contacts, photos, microphone audio, advertising identifiers or browsing history.
The app uses your phone's motion sensor only on the alarm screen to detect "shake to dismiss"; sensor data never leaves your device.
The app contains no advertising and no third-party analytics.</p>

<h2>How we use your data</h2>
<ul>
  <li>To run your alarms and to determine whether an alarm was dismissed, snoozed or missed.</li>
  <li>To record the donations that follow from the rules you set, and to show your history and statistics.</li>
  <li>To keep you signed in and to secure your account.</li>
</ul>
<p>We do not sell your data and do not use it for advertising.</p>

<h2>Sharing</h2>
<p>Your data is stored on servers operated by our hosting provider (Replit, Inc.), which processes it only on our behalf.
We do not share your personal data with charities or other third parties. When card payments are introduced, payment details
will be handled by a certified payment processor and this policy will be updated before that happens.
We may disclose data if required by law.</p>

<h2>Security</h2>
<p>All traffic between the app and our servers is encrypted (HTTPS). Passwords are hashed with scrypt; sign-in tokens are stored only in hashed form.</p>

<h2>Retention and deletion</h2>
<p>We keep your data while your account exists. You can delete your account at any time:</p>
<ul>
  <li>in the app: <b>Profile → Delete Account</b>, or</li>
  <li>on the web: <a href="delete-account">account deletion page</a>, or</li>
  <li>by emailing <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from your account's email address.</li>
</ul>
<p>Deleting your account immediately and permanently removes your profile, alarms, alarm history, donation records and sign-in sessions.
Copies may remain in encrypted server backups for up to 30 days before they are overwritten.</p>

<h2>Your rights</h2>
<p>Depending on where you live (for example under the GDPR or the CCPA), you may have the right to access, correct, export or delete your data,
and to object to its processing. Contact us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and we will respond within 30 days.</p>

<h2>Children</h2>
<p>The app is not intended for anyone under 18 and we do not knowingly collect data from children.
If you believe a child has created an account, contact us and we will delete it.</p>

<h2>Changes</h2>
<p>We will post any changes on this page and update the effective date. Significant changes will be announced in the app.</p>

<h2>Contact</h2>
<p>${PUBLISHER_NAME} · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
`);

const deleteAccountHtml = page("Delete your account", `
<h1>Delete your ${APP_NAME} account</h1>
<p class="muted">Published by ${PUBLISHER_NAME}</p>

<p>You can delete your account in the app (<b>Profile → Delete Account</b>) or here, by confirming your email and password.</p>
<p><b>What is deleted:</b> your profile (name, email, password), all alarms, alarm history, donation records and sign-in sessions.
Deletion is immediate and permanent. Copies may remain in encrypted server backups for up to 30 days.</p>
<p>Forgot your password? Email <a href="mailto:${CONTACT_EMAIL}?subject=Delete%20my%20account">${CONTACT_EMAIL}</a>
from your account's email address and we will delete the account within 7 days.</p>

<form id="f">
  <input name="email" type="email" placeholder="Email" autocomplete="email" required>
  <input name="password" type="password" placeholder="Password" autocomplete="current-password" required>
  <button type="submit">Permanently delete my account</button>
  <div id="result" role="status"></div>
</form>
<p class="muted"><a href="privacy">Privacy Policy</a></p>

<script>
const form = document.getElementById("f");
const result = document.getElementById("result");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("Delete your account and all its data? This cannot be undone.")) return;
  const button = form.querySelector("button");
  button.disabled = true;
  result.textContent = "Deleting…";
  try {
    const res = await fetch("auth/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email.value, password: form.password.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      form.reset();
      result.textContent = "Your account and all its data have been deleted.";
    } else {
      result.textContent = data.message || "Something went wrong. Please try again.";
    }
  } catch {
    result.textContent = "Network error. Please try again.";
  } finally {
    button.disabled = false;
  }
});
</script>
`);

router.get("/privacy", (_req, res) => { res.type("html").send(privacyHtml); });
router.get("/delete-account", (_req, res) => { res.type("html").send(deleteAccountHtml); });

export default router;
