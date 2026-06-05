# ぴよログ Grafana 取り込みAPI

ぴよログの記録を Cloudflare Workers 経由で TiDB Cloud Serverless に保存し、Grafana Cloud や AI Agent から参照するためのリポジトリです。

主な取り込み経路は次の2つです。

- Google Apps Script から、ぴよログのテキストエクスポートを `piyolog_events` に保存する
- ぴよログのカスタムアクションから、育児日記を `piyolog_diaries` に保存する

## 構成

- Cloudflare Workers
- TypeScript
- TiDB Cloud Serverless
- Grafana Cloud
- Google Apps Script
- macOS `launchd`
- GitHub Actions
- Cloudflare Secrets Store

## よく使うコマンド

Node.js 22以上を使います。ローカル環境変数は `.dev.vars.example` を参考に `.dev.vars` へ設定します。

```sh
npm install
npm test
npm run typecheck
npm run dev
npm run deploy
```

Macのミルク時間通知を確認する場合は次を使います。

```sh
npm run notify:formula -- --dry-run
```

## ドキュメント

詳細な手順は、関連ディレクトリまたは `docs/` 配下に分けています。

- [ぴよログデータ取り込みAPIとデータベース](docs/ingestion.md)
- [Google Apps Script 設定手順](apps-script/README.md)
- [Macのミルク時間通知](scripts/README.md)
- [AI Agent Slackインターフェース](docs/ai-agent/slack.md)
- [Grafana Cloud](docs/grafana.md)
- [セキュリティ](docs/security.md)
- [デプロイ](docs/deployment.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture Decision Records](docs/decisions/)

## 主要エンドポイント

```text
POST /api/text-records?token=<INGEST_TOKEN>
POST /api/custom-action-captures?token=<INGEST_TOKEN>
POST /api/slack/commands
```

各エンドポイントのpayloadや疎通確認方法は、対応するドキュメントを参照してください。
