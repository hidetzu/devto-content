// Images are referenced by absolute URL through raw.githubusercontent, which
// means this repository has to stay public. PNG rather than SVG: SVG served
// from raw is not reliably treated as an image by the fetching side.
export const GH_OWNER = process.env.GH_OWNER ?? 'hidetzu';
export const GH_REPO = process.env.GH_REPO ?? 'devto-content';
export const GH_BRANCH = process.env.GH_BRANCH ?? 'main';
export const RAW_BASE =
  `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}`;

// Bookkeeping keys that never reach the DEV API
export const LOCAL_KEYS = ['zenn_source', 'devto_id'];
