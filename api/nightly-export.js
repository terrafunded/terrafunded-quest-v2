/**
 * Vercel Node function. The implementation is bundled here at `npm run build`
 * (`api/_nightlyExport/dist/handler.js`) so Vercel does not typecheck src/.
 */
export { default } from "./_nightlyExport/dist/handler.js";
