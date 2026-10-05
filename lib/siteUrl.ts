// The site's public address, for anything that needs a full URL (the sitemap, share cards).
// SITE_URL overrides it; on Vercel it is the project's production domain (whichever domain is set
// as primary in the Vercel dashboard, so a new domain needs no code change); locally, the dev server.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (process.env.SITE_URL ?? (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
