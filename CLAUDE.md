# dev.to 記事 執筆ルール

このリポジトリは dev.to (DEV Community) 向けの**英語記事**を管理する。
元ネタは Zenn 記事（`~/work/private/zenn-content`）だが、**翻訳ではなく書き直す**。

## 大原則: Translate ではなく Rewrite

Zenn 側のルール（`はじめに`/`おわりに`、絵文字h2、背景→全体像→詳細）は
日本語記事の型であり、そのまま英訳すると DEV では機能しない。
**Zenn の構成ルールをこのリポジトリに持ち込まないこと。**

| Zenn (日本語) | dev.to (英語) |
|---|---|
| `## 🎯 はじめに` で背景から入る | 冒頭2〜3文で主張と結論を出す。導入見出しは置かない |
| `## 👋 おわりに` で締める | `## What I'd do differently` 等、内容を名前にした見出しで締める |
| h2 に絵文字 | 絵文字は使わない。sentence case |
| 16,000字の記事もあり | **1,200〜1,800 words**。超えるなら分割するか削る |
| `:::message` | `> **Note:** ...` の blockquote |
| ```mermaid | ソースには書いてよい。`npm run build` が PNG に焼く |

## 記事の構成

1. **Hook（2〜3文）** — 何が起きたか / 何を測ったか。結論を先に出す
2. **The setup** — 前提と再現条件。数字とバージョンを明示
3. **What actually happened** — 本題。計測値・コード・出力
4. **Why** — 仕組みの説明
5. **Trade-offs** — 採用しない場合、壊れる場合
6. **Takeaway** — 読者が明日使える1行

導入で `In this article, we will explore...` と書かない。冷たく始める。

## 文章スタイル

- 一人称は `I`。能動態
- 1文を短く。1段落は3〜4文まで
- 形容詞より数値（`much faster` ではなく `9m28s → 18s`）
- 日本ローカルな前提（国内SaaS、日本語特有の事情）は**説明を足すか、落とす**
- 専門用語は初出で1行の説明を添える

## タイトル

具体物 + 数値 + 意外性。日本語の「— 」で繋ぐ構文は英語では機能しない。

```
NG: OFFSET Doesn't Skip Rows - The Slowness of Pagination Measured on 10 Million PostgreSQL Rows
OK: OFFSET Doesn't Skip Rows: What 10M Rows in PostgreSQL Actually Cost
```

## frontmatter

```yaml
---
title: "OFFSET Doesn't Skip Rows"
published: false
description: "One sentence. Shown in the feed card."
tags: postgres, sql, performance, database
canonical_url: https://zenn.dev/hidetzu/articles/<zenn-slug>
cover_image: ""
series: ""            # 連載時のみ。空なら削除してよい
zenn_source: <zenn-slug>   # 出典管理用。publish 時に除去される
devto_id:             # 初回投稿後に publish スクリプトが書き戻す
---
```

- `published: false` 固定。公開は DEV のダッシュボードから手動
- `tags` は**最大4個・小文字英数のみ**（ハイフン不可）
- `canonical_url` は**必須**。Zenn 側に評価を寄せ、重複コンテンツ扱いを避ける
- `zenn_source` / `devto_id` は DEV には送られない

## 図解

- ソースには ` ```mermaid ` を書いてよい。DEV は mermaid を描画しないため `npm run build` が PNG 化する
- 背景は白で焼く（DEV のダークモードで透過背景だと文字が消えるため）
- 図 → テキスト説明の順

## ワークフロー

```bash
npm run build              # mermaid を PNG 化し dist/ を生成
npm run publish -- --dry-run
npm run publish            # DEVTO_API_KEY が必要
```

## チェックリスト

- [ ] 冒頭2〜3文で結論が出ているか
- [ ] 1,200〜1,800 words に収まっているか
- [ ] `はじめに`/`おわりに` を直訳した見出しが残っていないか
- [ ] h2 に絵文字が残っていないか
- [ ] `tags` が4個以内・小文字英数のみか
- [ ] `canonical_url` が正しい Zenn URL か
- [ ] `published: false` か
- [ ] 日本ローカルな前提に説明があるか
