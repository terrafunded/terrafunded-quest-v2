/**
 * Serves /api/weekly-actions in `vite` and `vite preview`.
 * Loaded only by vite.config.ts (Node). Never appears in the client graph.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { loadEnv } from "vite";
import { handleNodeWeeklyActions } from "./api/_weeklyActions/node";

function applyServerEnv(mode: string): void {
  const env = loadEnv(mode, process.cwd(), "");
  const names = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "QUEST_ALLOWED_TEST_EMAIL", "BLOB_READ_WRITE_TOKEN", "QUEST_EXPORT_STORE_DIR"] as const;
  for (const name of names) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (url !== "/api/weekly-actions") return false;
  await handleNodeWeeklyActions(req, res);
  return true;
}

function middleware(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
  void serve(req, res)
    .then((hit) => {
      if (!hit) next();
    })
    .catch(next);
}

export function weeklyActionsApi(): Plugin {
  return {
    name: "quest-weekly-actions-api",
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
