import type { IncomingMessage, ServerResponse } from "node:http";
import { handleNodeWeeklyActions } from "./node";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleNodeWeeklyActions(req, res);
}
