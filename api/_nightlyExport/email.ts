/**
 * Email the nightly diff. WhatsApp is clipboard-only in the app — no new
 * integration is added here.
 */

import type { AlertSender } from "../../src/lib/nightlyExport";

export function resendAlertSender(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): AlertSender | null {
  const apiKey = env.RESEND_API_KEY;
  const to = env.QUEST_ALERT_EMAIL;
  const from = env.QUEST_ALERT_FROM ?? "Quest <alerts@quest.terrafunded.com>";
  if (!apiKey || !to) return null;

  return {
    async send(text) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: text.split("\n")[0] ?? "Quest export changed",
          text,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend rejected the alert (${res.status}): ${body.slice(0, 200)}`);
      }
    },
  };
}
