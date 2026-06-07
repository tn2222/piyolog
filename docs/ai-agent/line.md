# AI Agent LINEインターフェース

piyolog AI Agent のインターフェースの1つとして、LINE の通常チャットメッセージから育児ログについて質問できます。

```text
LINE text message
  -> LINE Platform
  -> POST /api/line/webhook
  -> LINE webhook controller
  -> HandleLineTextMessageUseCase
  -> AskAssistantUseCase
  -> LINE reply API
  -> LINE userへtext reply
```

## Webhook URL

LINE Developers Console の Messaging API webhook URL に次を設定します。

```text
https://<deployed-worker-url>/api/line/webhook
```

この Worker の名前は `piyolog-grafana-ingestion` です。実際の deployed Worker URL は Cloudflare Workers の dashboard または deploy 出力で確認します。

## 環境変数

追加で次の環境変数を使います。

- `LINE_CHANNEL_SECRET`: LINE webhook request の `x-line-signature` 検証に使う Messaging API channel secret
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE reply API 呼び出しに使う Messaging API channel access token

ローカル開発では `.dev.vars` に設定します。

```sh
LINE_CHANNEL_SECRET=replace-with-line-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=replace-with-line-channel-access-token
```

## Cloudflare Secrets Store

本番では Cloudflare Secrets Store を source of truth として使い、Worker には Secrets Store binding として紐づけます。

| Secrets Store secret | Worker binding |
| --- | --- |
| `PIYOLOG_LINE_CHANNEL_SECRET` | `LINE_CHANNEL_SECRET` |
| `PIYOLOG_LINE_CHANNEL_ACCESS_TOKEN` | `LINE_CHANNEL_ACCESS_TOKEN` |

`wrangler.jsonc` に binding を追加した後、deploy して Worker に反映します。Secrets Store 側の値は Cloudflare dashboard または Wrangler から登録します。

## LINE Developers Console

Messaging API channel で次を確認または発行します。

- Channel secret
- Channel access token

Webhook settings で次を設定します。

- Webhook URL: `https://<deployed-worker-url>/api/line/webhook`
- Use webhook: enabled

設定後、LINE Developers Console の verify または実際の LINE メッセージ送信で疎通確認します。LINE Console の verify では `events` が空の webhook が送られる場合があり、その場合も Worker は成功応答を返します。

## Scope

この integration は個人利用の単一家庭前提です。LINE user と家庭・子どもの紐付け、複数家庭向けの権限管理、push message、rich menu、LIFF、画像、音声、sticker handling は対象外です。

LINE SDK は導入していません。現在必要な処理が raw body の署名検証、text message event の抽出、reply API による text reply に限られるため、Cloudflare Workers 標準の Web Crypto API と `fetch` で実装しています。LINE 固有機能が増えた場合は、client abstraction の拡張または SDK 導入を再検討します。
