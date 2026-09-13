/**
 * Vercel function entry. Bundled to api/weekly-council.js by
 * scripts/bundle-weekly-council.mjs so Vercel never typechecks src/ with node16.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleNodeWeeklyCouncil } from "./node";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleNodeWeeklyCouncil(req, res);
}
