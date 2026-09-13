import { WEEKLY_COUNCIL_MAX_TOKENS, WEEKLY_COUNCIL_MODEL } from "./types";
import { WEEKLY_COUNCIL_SYSTEM } from "./prompt";

export type AnthropicResult =
  | { ok: true; text: string; tokenCount: number }
  | { ok: false; kind: "missing_key" | "invalid_key" | "provider_error" };

interface AnthropicContent {
  type?: string;
  text?: string;
}

interface AnthropicBody {
  content?: AnthropicContent[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string };
}

/**
 * One Messages call. The key is read from `apiKey` (already taken from process.env by the
 * handler). It is never written to a log, never put in the returned object, never sent anywhere
 * except the `x-api-key` header of this request.
 */
export async function completeWeeklyRead(apiKey: string, userJson: string, fetchImpl: typeof fetch): Promise<AnthropicResult> {
  if (!apiKey) return { ok: false, kind: "missing_key" };
  let response: Response;
  try {
    response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: WEEKLY_COUNCIL_MODEL,
        max_tokens: WEEKLY_COUNCIL_MAX_TOKENS,
        system: WEEKLY_COUNCIL_SYSTEM,
        messages: [{ role: "user", content: userJson }],
      }),
    });
  } catch {
    return { ok: false, kind: "provider_error" };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, kind: "invalid_key" };
  let body: AnthropicBody;
  try {
    body = (await response.json()) as AnthropicBody;
  } catch {
    return { ok: false, kind: "provider_error" };
  }
  if (!response.ok) return { ok: false, kind: "provider_error" };
  const text = (body.content ?? []).filter((c) => c.type === "text" && c.text).map((c) => c.text as string).join("\n");
  if (!text) return { ok: false, kind: "provider_error" };
  const tokenCount = (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0);
  return { ok: true, text, tokenCount };
}
