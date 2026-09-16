# Repository Guidelines

## 開発方針

- 説明は日本語で、結論から簡潔に書く。確認した事実と提案を区別する。
- 合意した要件を満たす最小の変更にする。将来のためだけの抽象化や互換APIは追加しない。
- 設計判断は [docs/decisions/](docs/decisions/) を参照する。

## 構成と責務

TypeScriptのCloudflare Workerでぴよログを取り込み、TiDBへ保存する。

- `src/index.ts`: HTTPとCronの入口、依存関係の組み立て。
- `src/controller/`: HTTP入力と外部サービスのプロトコルを扱う。
- `src/application/`: UseCase。処理順序とトランザクション範囲を決める。
- `src/domain/`: 型、ルール、外部依存のインターフェース。
- `src/infrastructure/externalService/`: 外部APIのClient。
- `src/infrastructure/repository/`: Repository。渡された接続でSQLを実行する。
- `src/infrastructure/queryService/`: 参照と集計のSQL。
- `src/infrastructure/transaction/`: DBの開始、commit、rollbackとトランザクション用Repositoryの生成。
- `src/handler.ts` と `src/piyologText.ts`: 既存の取り込み処理とテキスト解析。`src/repository.ts` はRepositoryの再エクスポート。
- `test/`: Vitestのテスト。`migrations/`: DDL。`apps-script/`: Google Apps Script。`scripts/`: Mac通知。

トランザクションはUseCaseの `transaction.run(...)` で範囲を定める。
Repository自身は開始、commit、rollbackしない。
公開フィードのHTTP取得はトランザクションの外で行い、範囲のDELETEとUPSERTを同じトランザクションに含める。

## データの分離

GrafanaとMac通知は公開フィード由来の `piyolog_feed_events` を使う。
LLMはメモや日記を含む既存の `piyolog_events` と `piyolog_diaries` を使う。
取り込み仕様は [docs/ingestion.md](docs/ingestion.md) を参照する。

## 開発と検証

Node.jsは `.node-version` に合わせる。

- `npm install`: 依存関係をインストール。
- `npm run dev`: ローカルWorkerを起動。
- `npm test`: Vitestを実行。
- `npm run typecheck`: TypeScriptの型チェック。
- `npm run deploy -- --dry-run`: デプロイせずにWorkerをビルド。
- `npm run notify:formula -- --dry-run`: TiDBを参照して通知判定を確認。通知は送信しない。

TypeScriptはstrict、ES modules、2スペース、ダブルクォートを使う。
複数行の配列やオブジェクトは末尾カンマを付け、テスト対象のヘルパーはnamed exportを使う。
変数と関数はcamelCase、型とクラスはPascalCaseとし、既存の命名に揃える。
コード変更時は `npm test` と `npm run typecheck` を実行する。
解析、入力検証、Repository契約、Workerの応答を変えた場合は、対応する振る舞いのテストを更新する。
文書だけの変更ではリンクと `git diff --check` を確認する。
ローカルWorkerの動作確認には [.agents/skills/verify-piyolog/SKILL.md](.agents/skills/verify-piyolog/SKILL.md) を参照する。

## PRと運用

コミットは変更目的ごとに分け、PRには目的、変更内容、検証結果、必要なマイグレーションや設定を書く。
`main` へのpushはデプロイを起動するため、PRの更新と区別する。
デプロイ手順は [docs/deployment.md](docs/deployment.md) を参照する。

秘密情報と実データをコミットしない。公開フィードURLは認証情報なのでログにも出さない。
ローカルWorkerは `.dev.vars`、Mac通知は `.env` を使い、設定項目は `.dev.vars.example` に反映する。
本番のWorker secretsはCloudflare Secrets Storeで管理する。
詳細は [docs/security.md](docs/security.md) を参照する。
