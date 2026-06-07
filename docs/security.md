# セキュリティ

Apps Script とカスタムアクションからの取り込みリクエストは、URLクエリの共有トークンで認証します。

運用時は次を守ってください。

- HTTPSのURLだけを使う
- 十分に長いランダムなトークンを使う
- URL全体やトークンをログに残さない
- トークンが漏れた可能性がある場合はすぐにローテーションする

## Worker secrets

Worker の実行時 secret は Cloudflare Secrets Store を source of truth として管理します。GitHub Actions の secrets には置かず、Worker には Secrets Store binding として紐づけます。

- `PIYOLOG_INGEST_TOKEN` -> `INGEST_TOKEN`
- `PIYOLOG_DATABASE_URL` -> `DATABASE_URL`
- `PIYOLOG_SLACK_COMMAND_TOKEN` -> `SLACK_COMMAND_TOKEN`
- `PIYOLOG_PERSONAL_LLM_GATEWAY_URL` -> `PERSONAL_LLM_GATEWAY_URL`
- `PIYOLOG_PERSONAL_LLM_GATEWAY_TOKEN` -> `PERSONAL_LLM_GATEWAY_TOKEN`
- `PIYOLOG_LINE_CHANNEL_SECRET` -> `LINE_CHANNEL_SECRET`
- `PIYOLOG_LINE_CHANNEL_ACCESS_TOKEN` -> `LINE_CHANNEL_ACCESS_TOKEN`

Worker のコードは Secrets Store binding を実行時に `get()` して値を取得します。binding の追加・削除・参照先変更はデプロイが必要ですが、Secrets Store 側の値更新は再デプロイせずに反映される想定です。値の更新直後に全リクエストへ同時反映されることは前提にしません。

手動でsecretsを操作する前に、GitHub ActionsやSecrets Storeの設定が既に管理している値と衝突しないことを確認してください。

参考:

- [Cloudflare Secrets Store: Workers integration](https://developers.cloudflare.com/secrets-store/integrations/workers/)
- [Cloudflare Workers: Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
