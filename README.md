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
```

通常は `wrangler.jsonc` の設定で起動できます。
ローカルのinternal認証サービスを使う場合は、`.dev.vars` を作成し、
`AUTH_URL` にそのサービスのURLを指定して上書きします。
開発サーバーは次のコマンドで起動します。

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
AUTH_URL=https://auth.tmedit.org
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
管理画面のアバターにはauthで保存した画像を使います。既存ユーザーの画像は、再ログイン時に更新します。

## ページとお知らせを編集する

管理画面の `home`（ホーム）でホームページ、`pages`（ページ）で固定ページ、
`news`（お知らせ）でお知らせを編集します。
ホームは `home` コレクションのスラッグ `home` の記事を表示します。
編集項目は「トップの紹介」「活動内容」「公開プロジェクト」「よくある質問」の4つです。
紹介文や活動・FAQの一覧を編集でき、一覧は追加・削除・並べ替えができます。
ページ名、セクション見出し・順序、ボタン、GitHub組織・リンク・表示件数はコードで固定しています。
ホームのお知らせ欄は `news` から取得します。
既存DBでこの編集フォームを使うには、下記の初期化で「ホーム」だけを選んで実行してください。

既存DBに新しいseedを適用する場合は、管理メニューの「サイト設定・初期化」を開きます。
「ホーム」「固定ページ」「お知らせ」「メニュー」「サイト名・紹介文」から
初期化する項目を選びます。複数選択でき、「すべて選択」で一括初期化もできます。
警告を読んで「初期化」と入力し、「選択した項目を初期化する（seed）」を押して確認すると実行します。
この操作は管理者だけが実行できます。

選択したホーム・固定ページ・お知らせは、下書きや編集履歴も含めて削除し、
`seed/seed.json` のスキーマと初期コンテンツに置き換えます。
メニューとサイト名・紹介文は、選択した場合だけ初期設定に戻します。
お知らせメールの配信履歴・配信待ちデータは、「お知らせ」を選んだ場合だけ削除します。
選択していない項目は変更しません。
ユーザー・管理者権限・認証設定、メディア、メール購読者、他のコレクションは残ります。
必要なデータをバックアップし、初期化中は記事の編集・公開を控えてください。
失敗すると変更が一部反映される可能性があるため、ログと状態を確認してから再実行します。

seedを変更してコミット・デプロイするだけでは、既存DBは初期化されません。

### ページにPDFを添付する

`pages` の編集画面にある「添付PDF」で、PDFをアップロードまたはメディアから選択します。
1ページにつき1ファイルを添付でき、公開ページの本文下にプレビュー、
「別タブで開く」「ダウンロード」を表示します。添付しないページには表示しません。
プレビューはブラウザ標準のPDFビューアーを使います。表示できない端末では、
別タブまたはダウンロードから閲覧してください。

新規DBにはseedで添付欄が作成されます。既存DBには、記事や履歴を初期化せずに
次のコマンドで添付欄だけを追加できます。開発サーバーを起動してから実行します。

```bash
node scripts/add-page-document.mjs
```

本番はコードをデプロイした後、管理者のAPIトークンを `EMDASH_TOKEN` 環境変数に設定し、
`node scripts/add-page-document.mjs https://tmedit.org` を実行します。
管理画面の「Content Types」で `pages` に `document` フィールド（型 `file`、ラベル「添付PDF」、
許可MIME型 `application/pdf`）を追加する方法も使えます。追加済みの場合、スクリプトは変更しません。

添付PDFはページ専用のURLから配信します。ページを非公開にするとPDFも閲覧できず、
学内限定ページではプレビュー・ダウンロードにもverifyの在籍確認が必要です。
メディアの元URLは、ページの添付欄または編集履歴に参照がある間、管理画面のログイン利用者だけに配信します。
添付には、このサイトのメディアライブラリへアップロードしたPDFを使ってください。

サイトとCMSコンテンツの既定言語は `ja`（日本語）です。
`astro.config.mjs` の `i18n` とseedの `defaultLocale` をそろえ、URLに言語の接頭辞は付けません。
HTMLの `lang` とレスポンスの `Content-Language` も `ja` に設定します。

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
| `auth/` | internal認証サービスとの連携 |
| `src/plugins/` | メール送信、お知らせ通知、サイト初期化の管理画面 |
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
ローカルの上書き設定や秘密情報は `.dev.vars` に置きます。
`.env` と `.dev.vars` はGit管理から除外し、実際の秘密情報をコミットしません。

`.gitattributes` でテキストファイルの改行をLFに統一しています。

## Cloudflare Workersへデプロイする

デプロイ先のCloudflareアカウントで、`wrangler.jsonc` に対応するD1、R2、KV、
メール送信の設定を用意します。リソース名は次のとおりです。

| リソース | 名前 |
| --- | --- |
| Worker | `tmedit-org` |
| D1 | `tmedit-org` |
| R2 | `tmedit-org-media` |
| KV（セッション用） | `tmedit-org` |

セッション用KVは、ID `f7ea9f2d7add42aeb9661565be9ebcaf` を `SESSION` バインディングに設定しています。

既存の別名のリソースにデータがある場合は、接続先を確認してからデプロイしてください。
設定ファイルの名前を変えても、既存リソースの改名やデータ移行は行われません。
認証サービスの `AUTH_URL` は `https://auth.tmedit.org`、
公開サイトの `SITE_URL` は `https://tmedit.org` として、`wrangler.jsonc` の `vars` に設定しています。
送信元の `EMAIL_FROM`・`EMAIL_FROM_NAME`、公開URLの `SITE_URL` も確認します。

verify側で作成したSecrets StoreのIDを `CLOUDFLARE_SECRETS_STORE_ID` に設定します。
デプロイ時に `VERIFY_CLIENT_SECRET` バインディングを、同じストアの `CLIENT_SECRET_MAIN` につなぎます。
`VERIFY_CLIENT_SECRET` はこのサイトのコードで使うバインディング名です。
Secrets Storeに存在する必要があるシークレット名は `CLIENT_SECRET_MAIN` です。
verifyのクライアント設定は [src/config.mjs](https://github.com/TMed-IT/verify/blob/main/src/config.mjs)、
認証手順は [APIの使い方](https://github.com/TMed-IT/verify/blob/main/docs/api.md) を参照してください。
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

### EmDashを定期更新する

[Update EmDash](./.github/workflows/update-emdash.yml) が毎月1日9:00（日本時間）に
`emdash` と、直接依存する `@emdash-cms/*` の最新安定版を確認します。
メジャーバージョンの更新も対象です。
変更があれば型チェック・テスト・ビルドを実行し、成功した場合に更新PRを作成します。
未マージの更新PRがある場合は、追加更新を同じPRに反映します。
更新がない回はPRをそのまま残し、自動クローズやブランチ削除は行いません。
マージ後は自動デプロイされます。
GitHubのActions画面から `Update EmDash` を選び、`main` で手動実行もできます。

追加のSecretは不要です。リポジトリの Settings → Actions → General → Workflow permissions で
「Allow GitHub Actions to create and approve pull requests」を有効にしてください。
Organizationの設定で制限されている場合は、そちらでも許可が必要です。
設定の詳細は[PR作成Actionの説明](https://github.com/peter-evans/create-pull-request#workflow-permissions)を参照できます。

更新PRには、更新ワークフローでの検証結果を載せます。
`GITHUB_TOKEN` で作成したPRは通常のPR用ワークフローを起動しないため、更新処理内で検証を済ませます。

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

`AUTH_URL` と `SITE_URL` は公開URLのため、Gitで管理する `wrangler.jsonc` に記載します。
認証サービスや公開先を変える場合は、`vars` の値を更新してください。
