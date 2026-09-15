/**
 * Vercel function entry. Bundled to api/nightly-export.js by
 * scripts/bundle-weekly-council.mjs so Vercel never typechecks src/ with node16.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleNodeNightlyExport } from "./node";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleNodeNightlyExport(req, res);
}
