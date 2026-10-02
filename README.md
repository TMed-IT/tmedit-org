# 東邦大学医学部 IT部のWebサイト

IT部の活動紹介とお知らせを掲載する、`tmedit.org` のWebサイトです。
AstroとEmDash CMSを使い、Cloudflare Workersで動かします。
ページやお知らせは管理画面から編集し、データはD1、メディアはR2に保存します。

このREADMEは、サイトを開発・運用するメンバー向けです。
初めて開発するときは「ローカルで開発する」と「管理画面にログインする」を確認してください。
ファイルの場所やGit管理の方針は、作業に応じて参照できます。

## ローカルで開発する

Node.jsとpnpmを用意します。pnpmのバージョンは `package.json` の
`packageManager` に指定しています。

```bash
pnpm install
cp .env.example .env
```

`.env` の `AUTH_URL` を、利用するinternal認証サービスのURLに変更してください。
ログインに使う認証サービスは、このリポジトリとは別に動かします。
設定を終えたら、開発サーバーを起動します。

```bash
pnpm dev
```

サイトは `http://localhost:4321`、管理画面は
`http://localhost:4321/_emdash/admin` です。

| コマンド | 用途 |
| --- | --- |
| `pnpm dev` | 開発サーバーを起動する |
| `pnpm test` | 在籍確認の連携をテストする |
| `pnpm typecheck` | Astro・TypeScriptの型を確認する |
| `pnpm build` | 本番用にビルドする |
| `pnpm preview` | ビルド結果をローカルで確認する |
| `pnpm deploy` | ビルドしてCloudflare Workersへデプロイする |

## 管理画面にログインする

サイトの「管理画面」リンクから、internal認証サービスへ移動します。
認証後は、一度だけ使える認証コードをEmDash側で検証し、管理画面へ戻ります。
コードの交換にはPKCEを使い、認証Cookieや署名鍵はEmDashと共有しません。

`AUTH_URL` には認証サービスのオリジン（スキームとホスト名、必要ならポート）を指定します。
本番ではHTTPSを使います。

```dotenv
AUTH_URL=https://internal-auth.example.com
```

認証サービス側の `AUTH_TRUSTED_ORIGINS` には、このサイトのホスト名ラベルを追加してください。
認証後の戻り先は、次の固定パスです。

- ローカル：`http://localhost:4321/_emdash/api/auth/callback`
- 本番：`https://tmedit.org/_emdash/api/auth/callback`

internal認証で最初にログインしたユーザーにはEmDashの管理者権限を付与します。
既存ユーザーにリンクした場合も、管理者権限を付与します。
以降の新規ユーザーは、既定でAuthorになります。
`AUTH_DEFAULT_ROLE` で新規ユーザーの既定ロールを変更できます。
以降のログインでは、既存ユーザーのロールは変更しません。

## ページとお知らせを編集する

管理画面の `pages` で固定ページ、`news` でお知らせを編集します。
ホームページは、`home` ページの専用フィールドで見出し、活動紹介、
GitHubプロジェクトの表示設定、FAQを変更します。

`campus_only` を有効にしたページやお知らせは、
[verify](https://verify.tmedit.org)で大学のメールアドレスによる在籍確認を済ませると閲覧できます。
お知らせページの「大学のメールアドレスで在籍確認する」から確認を始めます。
限定ページを直接開いた場合も、確認後に元のページに戻ります。
IPアドレスによる判定は行いません。管理画面のinternal認証とは別の仕組みです。

認証にはstateとPKCEを使い、受け取ったトークンはHttpOnly・SecureのCookieに保存します。
閲覧のたびにverifyへ有効性を問い合わせるため、verifyで認証を取り消すと次のアクセスから反映されます。
verifyの障害時は503を返し、Cookieは保持します。限定コンテンツや利用者によって変わる一覧は共有キャッシュに保存しません。

お知らせのメール購読には、登録確認と配信停止の機能があります。
公開時に配信待ちデータを作成し、Workerの定期処理で送信します。
開発中の購読確認メールとお知らせメールは、コンソールに出力します。

## 変更するファイルを探す

| ファイル・ディレクトリ | 内容 |
| --- | --- |
| `astro.config.mjs` | Astro、EmDash、認証、プラグインの設定 |
| `wrangler.jsonc` | Worker、D1、R2、メール送信、定期処理の設定 |
| `seed/seed.json` | コレクションのスキーマと初期コンテンツ |
| `src/pages/` | ページとAPIの処理 |
| `src/components/` | ホームページなどの表示部品 |
| `src/styles/theme.css` | 色や文字などのデザイン調整 |
| `auth/internal/` | internal認証サービスとの連携 |
| `src/plugins/` | メール送信とお知らせ通知のプラグイン |
| `src/lib/verify-client.ts` | verifyとの認証連携 |
| `src/pages/auth/verify/` | 在籍確認の開始とコールバック |
| `src/lib/news-subscriptions.ts` | メール購読と配信処理 |
| `src/worker.ts` | Workerの定期処理 |
| `brand/` | ロゴなどの公開アセット |

開発時のEmDashに関するルールは [AGENTS.md](./AGENTS.md) にまとめています。
APIや設定の仕様を調べるときは、[EmDashのドキュメント](https://docs.emdashcms.com/)を参照してください。

## ソースと共有設定をGitで管理する

ソースコード、`seed/seed.json`、`pnpm-lock.yaml`、設定ファイルをコミットします。
ルートの型定義 `emdash-env.d.ts` と `worker-configuration.d.ts` も管理対象です。
型定義を更新した場合は、対応するスキーマや設定の変更と一緒にコミットしてください。

依存パッケージ、ビルド成果物、生成メタデータ、Wranglerのローカルデータ、
アップロードファイル、キャッシュ、ログ、ローカルのレビュー記録（`docs/tmp/review/`）は `.gitignore` で除外します。
環境変数やローカルの秘密情報は `.env` または `.dev.vars` に置きます。
共有する設定例には `.env.example` または `.dev.vars.example` を使い、実際の秘密情報は記載しません。

`.gitattributes` でテキストファイルの改行をLFに統一しています。

## Cloudflare Workersへデプロイする

デプロイ先のCloudflareアカウントで、`wrangler.jsonc` に対応するD1、R2、
メール送信の設定を用意します。リソース名は次のとおりです。

| リソース | 名前 |
| --- | --- |
| Worker | `tmedit-org` |
| D1 | `tmedit-org` |
| R2 | `tmedit-org-media` |

既存の別名のリソースにデータがある場合は、接続先を確認してからデプロイしてください。
設定ファイルの名前を変えても、既存リソースの改名やデータ移行は行われません。
Workerのシークレットには `AUTH_URL` を設定してください。
送信元の `EMAIL_FROM`・`EMAIL_FROM_NAME`、公開URLの `SITE_URL` も確認します。

verify側で作成したSecrets StoreのIDを `CLOUDFLARE_SECRETS_STORE_ID` に設定します。
デプロイ時に `VERIFY_CLIENT_SECRET` バインディングを、同じストアの `CLIENT_SECRET_TMEDIT` につなぎます。
シークレットの値を取得したり、このリポジトリへコピーしたりする必要はありません。
verifyと同じCloudflareアカウントにデプロイしてください。

verify側にはクライアントID `tmedit` と戻り先 `https://tmedit.org/auth/verify/callback` が登録されています。
ドメインを変える場合は、verify側の許可設定と `src/lib/verify-client.ts` のURLをそろえます。
ローカル開発で認証を試す場合も、verify側に開発用クライアントの登録が必要です。
ローカルから本番のSecrets Storeは参照できないため、両プロジェクトに同じテスト用シークレットを用意します。
ローカルやプレビュー環境で認証を省略する処理はありません。

```bash
CLOUDFLARE_SECRETS_STORE_ID=YOUR_STORE_ID pnpm deploy
```

このコマンドはビルド後にWorkerをデプロイします。
公開先や認証サービスを変更した場合は、認証サービス側の許可設定と戻り先URLも確認してください。

### mainへのpushで自動デプロイする

[GitHub Actionsのワークフロー](./.github/workflows/deploy.yml)で、
`main` へのpush後に型確認・認証テスト・ビルド・デプロイを実行します。
GitHubのActions画面からも、`main` を選んで手動実行できます。
同時に複数のデプロイは実行しません。

GitHub Actionsでは、次のSecretとVariablesを使います。

| 名前 | 登録先 | 値 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Repository secret | デプロイ先アカウント用のCloudflare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Organization variable（登録済み） | デプロイ先のCloudflareアカウントID |
| `CLOUDFLARE_SECRETS_STORE_ID` | RepositoryまたはOrganization variable | verifyで使っているSecrets StoreのID |

APIトークンは、リポジトリの Settings → Secrets and variables → Actions →
New repository secret で登録してください。
Organization variableのアクセス対象に、このリポジトリを含めてください。
ワークフローは `vars.CLOUDFLARE_ACCOUNT_ID` からアカウントIDを読み取ります。

トークンはCloudflareの「Edit Cloudflare Workers」テンプレートを使い、
対象アカウントに限定して作成します。D1、R2、Astroのセッション用KVも使うため、
トークンの `D1`・`Workers R2 Storage`・`Workers KV Storage` の権限も確認してください。
既存リソースの参照にはRead、Wranglerにリソースを作成させる場合はEditが必要です。
設定手順は[CloudflareのGitHub Actionsガイド](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)を参照できます。

Secrets Storeのバインディングには `Account Secrets Store: Edit` 権限が必要です。
共有シークレットのscopeには `workers` を含めてください。
詳細は[Secrets Storeのアクセス制御](https://developers.cloudflare.com/secrets-store/access-control/)を参照してください。

初回実行前に、`wrangler.jsonc` のWorker名、D1、R2、メール送信設定が
デプロイ先と一致することを確認してください。既存のD1を使う場合は、
その `database_id` も設定しておくと接続先を固定できます。

`AUTH_URL` はGitHub Secretではなく、CloudflareのWorkerシークレットに設定します。
Cloudflareの管理画面、またはローカルで次のコマンドを使って登録してください。
コマンドの入力待ちになったら、認証サービスのオリジンを入力します。

```bash
pnpm exec wrangler secret put AUTH_URL
```

同じWorkerへのデプロイでは、設定済みの `AUTH_URL` は維持されます。
Worker名を変更した場合は、新しいWorkerにも `AUTH_URL` を設定してください。
このプロジェクトでは必須シークレットとして宣言しているため、
未設定の場合はデプロイに失敗します。
