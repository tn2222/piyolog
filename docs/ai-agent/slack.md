# AI Agent Slackインターフェース

piyolog AI Agent のインターフェースの1つとして、Slack slash command から育児ログについて質問できます。

```text
Slack slash command
  -> POST /api/slack/commands
  -> AskAssistantUseCase
  -> Personal LLM Gatewayでtool selection
  -> Worker側でcompare_metric / summarize_periodを検証・実行
  -> Personal LLM Gatewayで回答生成
  -> Slackへephemeral response
```

## 環境変数

追加で次の環境変数を使います。

- `SLACK_COMMAND_TOKEN`: Slack slash command payload の `token` 検証に使う共有トークン
- `PERSONAL_LLM_GATEWAY_URL`: Personal LLM Gateway のベースURL
- `PERSONAL_LLM_GATEWAY_TOKEN`: Personal LLM Gateway 呼び出し用のBearer token

ローカル開発では `.dev.vars` に設定します。

```sh
SLACK_COMMAND_TOKEN=replace-with-slack-command-token
PERSONAL_LLM_GATEWAY_URL=https://example.execute-api.ap-northeast-1.amazonaws.com
PERSONAL_LLM_GATEWAY_TOKEN=replace-with-personal-llm-gateway-token
```

Worker のSlack slash commandエンドポイントは次です。

```text
https://<deployed-worker-url>/api/slack/commands
```

## Tools

現在のtoolsは次の2つです。

- `compare_metric`: ミルク量、睡眠、排泄、イベント数などを2期間で比較する
- `summarize_period`: 任意期間の育児ログをサマリーする

Personal LLM Gatewayはtoolを選択し、回答文を生成します。TiDBへの接続、tool callの検証、SQL実行はWorker側で行います。

設計の詳細は [../ARCHITECTURE.md](../ARCHITECTURE.md) と [../decisions/2026-05-31-structure-piyolog-ai-agent-worker.md](../decisions/2026-05-31-structure-piyolog-ai-agent-worker.md) を参照してください。
