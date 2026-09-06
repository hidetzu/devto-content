# devto-content

dev.to (DEV Community) 向けの英語記事。元ネタは [zenn-content](https://github.com/hidetzu/zenn-content) だが、翻訳せず書き直す。

執筆ルールは [CLAUDE.md](./CLAUDE.md)。

## 構成

```
posts/     記事のソース（mermaid を書いてよい）
assets/    build が生成した図の PNG（commit する）
dist/      build の出力。投稿されるのはこれ（gitignore）
scripts/   build / publish / wordcount
```

## 使い方

```bash
npm install
cp posts/_template.md posts/my-post.md

npm run build                  # mermaid -> assets/*.png、dist/ を生成
npm run wc                     # word 数を確認（1,200-1,800 が目安）
npm run publish -- --dry-run   # 規約チェックのみ
```

投稿するには DEV の API key が要る（`https://dev.to/settings/extensions`）。
リポジトリ直下の `.env` に置けば `publish` が自動で読む（gitignore 済み）。

```
DEVTO_API_KEY=xxxx
```

```bash
npm run publish -- --only my-post
```

> API key は**公開している dotfiles に書かないこと**。`.env` か、CI なら GitHub Secrets に置く。

- `published: false` 固定なので、作られるのは**下書き**。公開は DEV のダッシュボードから手動
- 初回投稿で採番された id が `posts/*.md` の `devto_id` に書き戻され、以降は更新（PUT）になる
- 画像は raw.githubusercontent 経由の絶対URLで参照するため、**assets/ を push してから publish する**

## CI

- push / PR: `validate` が build と規約チェックを走らせる（投稿はしない）
- 手動実行 (`workflow_dispatch`): `publish` が下書きを作成し、`devto_id` を commit する。`DEVTO_API_KEY` を Secrets に登録しておくこと
