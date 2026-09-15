/**
 * Shared Quest key-value backend (Vercel Blob or filesystem). Never Payments.
 * Kept free of src/lib so Vite plugins can import it without the @ alias.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BlobClient {
  put(pathname: string, body: string): Promise<void>;
  get(pathname: string): Promise<string | null>;
  del(pathname: string): Promise<void>;
}

export function vercelBlobClient(token: string, fetchImpl: typeof fetch): BlobClient {
  const api = "https://blob.vercel-storage.com";
  return {
    async put(pathname, body) {
      const url = new URL(api);
      url.searchParams.set("pathname", pathname);
      const res = await fetchImpl(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
          "x-content-type": "application/json",
          "x-add-random-suffix": "0",
        },
        body,
      });
      if (!res.ok) throw new Error(`Quest blob put failed (${res.status})`);
    },
    async get(pathname) {
      const url = new URL(api);
      url.searchParams.set("pathname", pathname);
      const res = await fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
        },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Quest blob get failed (${res.status})`);
      const json = (await res.json()) as { url?: string } | string;
      if (typeof json === "string") return json;
      if (json.url) {
        const file = await fetchImpl(json.url);
        if (file.status === 404) return null;
        if (!file.ok) throw new Error(`Quest blob download failed (${file.status})`);
        return file.text();
      }
      return JSON.stringify(json);
    },
    async del(pathname) {
      const url = new URL(api);
      url.searchParams.set("url", pathname);
      const res = await fetchImpl(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
        },
      });
      if (!res.ok && res.status !== 404) throw new Error(`Quest blob del failed (${res.status})`);
    },
  };
}

export interface QuestKv {
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
}

export function filesystemQuestKv(root: string): QuestKv {
  return {
    async get(key) {
      try {
        return await readFile(path.join(root, key), "utf8");
      } catch {
        return null;
      }
    },
    async put(key, body) {
      const dest = path.join(root, key);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, body, "utf8");
    },
  };
}

export function blobQuestKv(client: BlobClient): QuestKv {
  return {
    async get(key) {
      return client.get(key);
    },
    async put(key, body) {
      await client.put(key, body);
    },
  };
}

export function resolveQuestKv(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): {
  kv: QuestKv;
  kind: "blob" | "fs";
} {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (token) return { kv: blobQuestKv(vercelBlobClient(token, fetchImpl)), kind: "blob" };
  const dir = env.QUEST_EXPORT_STORE_DIR;
  if (dir) return { kv: filesystemQuestKv(dir), kind: "fs" };
  return { kv: filesystemQuestKv(path.join("/tmp", "quest-export-store")), kind: "fs" };
}
