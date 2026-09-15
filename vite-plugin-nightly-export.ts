/**
 * Serves /api/nightly-export in `vite` and `vite preview`
 * so local and Playwright hit the same handler Vercel will.
 *
 * The handler graph uses `@/` aliases, so this plugin must not import it
 * at config-load time. Dev uses Vite's SSR loader; preview uses the bundle.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { loadEnv } from "vite";
import path from "node:path";
import { pathToFileURL } from "node:url";

function applyServerEnv(mode: string): void {
  const env = loadEnv(mode, process.cwd(), "");
  const names = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "QUEST_ALLOWED_TEST_EMAIL",
    "QUEST_TEST_EMAIL",
    "QUEST_TEST_PASSWORD",
    "QUEST_VIEWER_EMAIL",
    "QUEST_VIEWER_PASSWORD",
    "QUEST_EXPORT_STORE_DIR",
    "BLOB_READ_WRITE_TOKEN",
    "RESEND_API_KEY",
    "QUEST_ALERT_EMAIL",
    "QUEST_ALERT_FROM",
    "CRON_SECRET",
    "QUEST_PUBLIC_URL",
  ] as const;
  for (const name of names) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
}

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function isNightlyUrl(url: string | undefined): boolean {
  return (url?.split("?")[0] ?? "") === "/api/nightly-export";
}

export function nightlyExportApi(): Plugin {
  return {
    name: "quest-nightly-export-api",
    configureServer(server: ViteDevServer) {
      applyServerEnv(server.config.mode);
      server.middlewares.use((req, res, next) => {
        if (!isNightlyUrl(req.url)) {
          next();
          return;
        }
        void server
          .ssrLoadModule("/api/_nightlyExport/node.ts")
          .then((mod) => {
            const handle = (mod as { handleNodeNightlyExport: NodeHandler }).handleNodeNightlyExport;
            return handle(req, res);
          })
          .catch(next);
      });
    },
    configurePreviewServer(server) {
      applyServerEnv(server.config.mode);
      const bundled = pathToFileURL(path.resolve(process.cwd(), "api/_nightlyExport/dist/handler.js")).href;
      server.middlewares.use((req, res, next) => {
        if (!isNightlyUrl(req.url)) {
          next();
          return;
        }
        void import(bundled)
          .then((mod: { default: NodeHandler }) => mod.default(req, res))
          .catch(next);
      });
    },
  };
}
