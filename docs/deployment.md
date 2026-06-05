# デプロイ

通常運用では、`main` ブランチへの push で GitHub Actions から Worker をデプロイします。必要に応じて `workflow_dispatch` で手動実行できます。

deploy job では `.node-version` の Node.js を使い、`npm ci`、`npm run typecheck`、`npm test` の成功後に Cloudflare 公式の `cloudflare/wrangler-action` でデプロイします。

GitHub Actions からデプロイするため、CI/CD 用の認証情報を GitHub repository secrets として設定します。

- `CLOUDFLARE_ACCOUNT_ID`: デプロイ先の Cloudflare account ID
- `CLOUDFLARE_API_TOKEN`: `piyolog-grafana-ingestion` Worker をデプロイできる Cloudflare API token

Cloudflare API token は、Cloudflare dashboard の Account API tokens で作成します。権限は `Edit Cloudflare Workers` を使い、対象 account をこの Worker のデプロイ先に絞ります。値は repository にコミットせず、GitHub Actions の secrets にだけ保存します。

Worker の実行時secretは Cloudflare Secrets Store で管理します。詳しくは [セキュリティ](security.md) を参照してください。

参考:

- [Cloudflare Workers: GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
