// 画像は raw.githubusercontent 経由で絶対URL参照する。
// SVG は Content-Type の扱いが環境依存なので PNG に統一する。
export const GH_OWNER = process.env.GH_OWNER ?? 'hidetzu';
export const GH_REPO = process.env.GH_REPO ?? 'devto-content';
export const GH_BRANCH = process.env.GH_BRANCH ?? 'main';
export const RAW_BASE =
  `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}`;

// DEV に送らないローカル管理用のキー
export const LOCAL_KEYS = ['zenn_source', 'devto_id'];
