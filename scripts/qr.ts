/**
 * Writes the QR code for the live URL to docs/qr-live.png and docs/qr-live.svg.
 *
 *   npm run qr                                  # planned production URL
 *   npm run qr -- https://your-deployment.vercel.app
 *
 * Re-run after the first deploy if Vercel assigned a different URL, then commit both files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

export const PLANNED_URL = "https://terrafunded-quest-v2.vercel.app";

async function main() {
  const url = process.argv[2] ?? PLANNED_URL;
  if (!/^https?:\/\//.test(url)) throw new Error(`Not a URL: ${url}`);
  mkdirSync("docs", { recursive: true });
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#14161a", light: "#f4ecd8" } };
  await QRCode.toFile("docs/qr-live.png", url, { ...opts, type: "png", width: 512 });
  const svg = await QRCode.toString(url, { ...opts, type: "svg", width: 512 });
  writeFileSync("docs/qr-live.svg", svg);
  console.log(`QR for ${url} → docs/qr-live.png, docs/qr-live.svg`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
