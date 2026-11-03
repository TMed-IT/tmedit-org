# サイト固有のD1マイグレーション

このディレクトリのSQLは、既存の本番DBにサイト固有の変更を適用するための履歴です。
番号順に実行し、D1の `d1_migrations` テーブルで適用済みファイル名を管理します。
適用済みSQLは、改名・移動・統合・書き換えを行いません。修正が必要な場合は次の番号で追加します。

| 番号 | 変更内容 |
| --- | --- |
| `0001_page_document.sql` | 固定ページの添付PDFフィールドとメディア参照インデックスを追加 |
| `0002_page_categories.sql` | 既存カテゴリーを固定ページの分類に使用 |
| `0003_remove_legacy_posts.sql` | 旧お知らせコレクションと関連メタデータを削除 |
| `0004_single_segment_slugs.sql` | slugにスラッシュを含めない制約を追加 |
| `0005_slug_route_conflicts.sql` | 固定ページ・カテゴリー・予約URLの衝突を防止 |
| `0006_omorisai_taxonomy.sql` | カテゴリーを大森祭Taxonomyへ移行し、旧URLの転送と分類全体のURL制約を設定 |
| `0007_documents_route.sql` | 文書公開用の `/documents` を予約。既存の衝突があれば変更前に停止 |
| `0008_docs_route.sql` | 諸則の公開先 `/docs` を予約。旧URLの予約と既存の制約を保持 |
| `0009_rules_collection.sql` | 諸則コレクション、記事ごとの公開範囲、メディア参照の変更検知、slug制約を追加 |
| `0010_rules_display_order.sql` | 諸則の表示順フィールドと並べ替え用インデックスを追加 |

`0001`〜`0010` は2026年11月3日に本番の適用履歴を確認済みです。
現在の状態は次のコマンドで確認してください。

```bash
pnpm db:migration:list
```

## 新しい変更を追加する

```bash
pnpm db:migration:create 変更の名前
```

生成された番号付きSQLに、変更前のDBを想定した差分を記述します。
必要なseedの更新と、既存記事・下書き・分類などを保持できることの検証を合わせて行います。
`pnpm test` はSQLを一時DBで検証し、本番DBは変更しません。
デプロイではビルドの後、Workerの更新前に `pnpm db:migrate` を実行します。
SQLの適用に失敗した場合は、Workerを更新しません。

## EmDash本体のマイグレーションと区別する

EmDash内部のテーブル更新は、EmDashが自身の適用履歴で管理します。
本体のSQLをここへコピーしたり、D1の `d1_migrations` に登録したりしないでください。
ビルド時に生成する `.emdash/migrations.json` は本体用の実行情報で、Git管理の対象外です。

新規DBはEmDash本体と `seed/seed.json` で初期化します。
このディレクトリは既存DBへの変更履歴なので、seed適用済みの新規DBへ全SQLを再実行する用途には使いません。
管理画面からのseed初期化も、この履歴の削除や再実行は行いません。
