/**
 * Vercel Node serverless function.
 *
 * ANTHROPIC_API_KEY is read only from process.env inside the handler.
 * Never log the key. Never put it in a response. Never prefix it VITE_.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleNodeWeeklyCouncil } from "./weeklyCouncil/node";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleNodeWeeklyCouncil(req, res);
}
