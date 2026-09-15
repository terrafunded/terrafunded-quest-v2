import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWeeklyActions, type WeeklyActionsDeps } from "./handle";

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function headersFromNode(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

export async function handleNodeWeeklyActions(
  req: IncomingMessage,
  res: ServerResponse,
  deps?: WeeklyActionsDeps,
): Promise<void> {
  const host = req.headers.host ?? "localhost";
  const url = `https://${host}${req.url ?? "/api/weekly-actions"}`;
  const method = req.method ?? "GET";
  const headers = headersFromNode(req);
  const body = method === "GET" || method === "HEAD" ? undefined : await collectBody(req);
  const request = new Request(url, { method, headers, body });
  const response = await handleWeeklyActions(request, deps);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(await response.text());
}
