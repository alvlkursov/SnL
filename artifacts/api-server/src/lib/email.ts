// Transactional email through Resend (https://resend.com). Needs RESEND_API_KEY and
// EMAIL_FROM (e.g. "WakeOrDonate <noreply@yourdomain.com>") in the server's secrets.

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Resend's shared sender works before a domain is verified, but only to your own address
      from: process.env.EMAIL_FROM || "WakeOrDonate <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Email send failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}
