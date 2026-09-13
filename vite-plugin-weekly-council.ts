/**
 * Serves POST /api/weekly-council in `vite` and `vite preview`
 * so local and Playwright hit the same handler Vercel will.
 *
 * This file is loaded only by vite.config.ts (Node). It must never
 * appear in the client graph — the Anthropic key stays in process.env.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { loadEnv } from "vite";
import { handleNodeWeeklyCouncil } from "./api/_weeklyCouncil/node";

function applyServerEnv(mode: string): void {
  const env = loadEnv(mode, process.cwd(), "");
  const names = [
    "ANTHROPIC_API_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "QUEST_ALLOWED_TEST_EMAIL",
  ] as const;
  for (const name of names) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (url !== "/api/weekly-council") return false;
  await handleNodeWeeklyCouncil(req, res);
  return true;
}

function middleware(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
  void serve(req, res)
    .then((hit) => {
      if (!hit) next();
    })
    .catch(next);
}

export function weeklyCouncilApi(): Plugin {
  return {
    name: "quest-weekly-council-api",
    configureServer(server: ViteDevServer) {
      applyServerEnv(server.config.mode);
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      applyServerEnv(server.config.mode);
      server.middlewares.use(middleware);
    },
  };
}
