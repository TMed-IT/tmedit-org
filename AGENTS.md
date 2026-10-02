# 東邦大学医学部 IT部のWebサイト

日本語で回答してください。
AstroとEmDash CMSで活動紹介、お知らせ、固定ページを提供し、Cloudflare Workersで動かします。

## 開発と検証

```bash
pnpm dev        # マイグレーション、seed、型生成を含む開発サーバー
pnpm typecheck  # Astro・TypeScriptの型確認
pnpm test       # verify連携のテスト
pnpm build      # 本番ビルド
```

管理画面は `http://localhost:4321/_emdash/admin` です。
デプロイの設定と必要なシークレットはREADMEを確認してください。

## 主なファイル

| ファイル | 役割 |
| --- | --- |
| `astro.config.mjs` | EmDash、認証、D1、R2、プラグインの設定 |
| `wrangler.jsonc` | Worker・D1・KV `tmedit-org`、R2 `tmedit-org-media` の設定 |
| `seed/seed.json` | `pages`・`news` のスキーマ、初期コンテンツ、メニュー |
| `src/pages/index.astro` | ホームの活動紹介、お知らせ、プロジェクト、FAQ |
| `src/pages/newsroom/` | お知らせの一覧と詳細 |
| `src/pages/[slug].astro` | CMSの固定ページ。プライバシーポリシー、利用規約など |
| `src/pages/contact.astro` | 問い合わせ窓口の準備中案内。送信フォームは未実装 |
| `auth/internal/` | 管理画面のinternal認証 |
| `src/lib/verify-client.ts` | 学内限定コンテンツのverify認証 |
| `src/lib/news-subscriptions.ts` | お知らせの購読、配信停止、メール配信 |
| `src/plugins/` | Cloudflareメール送信、お知らせ公開時の通知 |
| `src/worker.ts` | EmDashの定期処理と通知キューの配信 |
| `tokens.css`・`src/styles/theme.css` | サイトのデザイン設定 |
| `emdash-env.d.ts`・`worker-configuration.d.ts` | スキーマとWorker設定から生成する型定義 |

## コンテンツと認証のルール

- CMSページは `output: "server"` でサーバーレンダリングします。`getStaticPaths()` は使いません。
- コンテンツを取得したページは `Astro.cache.set(cacheHint)` を呼びます。
- `campus_only` はverifyによる在籍確認を必要とする設定です。IP判定や開発時の認証省略は行いません。
- 認証状態で内容が変わるページは共有キャッシュを無効にします。
- 管理画面のinternal認証と、閲覧者のverify認証は別の仕組みです。
- URLには `entry.id`（slug）、API呼び出しには `entry.data.id`（DBのULID）を使います。
- CMSの画像フィールドは `{ src, alt }` 形式です。`emdash/ui` の `<Image image={...} />` で表示します。
- `src/live.config.ts` はローダー登録用の共通コードです。変更しません。
- ホームは専用フィールドで編集します。`marketing.*` の読み取りと移行スクリプトは、旧DBとの互換性のために残しています。
- メニューの `primary`・`footer_product`・`footer_company`・`footer_support` はseedとDBの識別子です。改名する場合は既存DBの移行も考慮してください。
- 色や文字の調整は `tokens.css` と `src/styles/theme.css` で行います。共通の `src/styles/tokens.css` や `Base.astro` を見た目の変更目的で編集しません。

## EmDashの仕様を確認する

`.agents/skills/` の `building-emdash-site`、`creating-plugins`、`emdash-cli` を作業に応じて使います。
API、フック、設定、フィールド型は、EmDashのドキュメントMCPの `search_docs` で確認してください。
接続先は `https://docs.emdashcms.com/mcp` です。
