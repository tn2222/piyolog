# AI Agent MCPインターフェース

piyolog AI Agent のインターフェース候補として、ChatGPT web の custom MCP app から呼び出すための最小MCP serverを提供します。

この段階では、piyolog DBの読み取りや観察メモ保存は行わず、ChatGPT webとpiyolog Workerの疎通確認だけを目的にします。

```text
ChatGPT web custom MCP app
  -> POST /mcp
  -> MCP JSON-RPC handler
  -> ping_piyolog
  -> pong
```

## MCP endpoint

ChatGPT custom app には次のURLを登録します。

```text
https://<deployed-worker-url>/mcp
```

ローカル検証でMCP Inspectorを使う場合は、`npm run dev` でWorkerを起動し、Inspectorから次のURLを指定します。

```text
http://127.0.0.1:<wrangler-port>/mcp
```

ChatGPTから接続するにはHTTPSで到達できるURLが必要です。ローカルWorkerを直接ChatGPTに登録する場合は、ngrokなどでHTTPS tunnelを作って、そのURLの `/mcp` を登録します。本番検証ではCloudflare WorkersにdeployしたURLを使います。

## Tools

### `ping_piyolog`

ChatGPT webからpiyolog用MCP serverへtool callできるか確認するための最小toolです。

Input schema:

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

Output:

```json
{
  "message": "pong"
}
```

## 読み取りtoolの設計方針

`ping_piyolog` の次に追加する本番向けtoolは、MCP serverを本体にせず、piyolog Agent Core / Domain APIのadapterとして実装します。

最初の読み取りtool候補は `get_recent_baby_logs` です。ChatGPT webから期間を指定して、ぴよログの時刻付きイベントと育児日記を取得するために使います。

MCP toolとAgent Core APIの責務分離、tool名、input schema、`run_agent(message)` を避ける方針は [MCP向け読み取りAPI境界のADR](../decisions/2026-06-08-design-mcp-read-api-boundary.md) を参照してください。

## ChatGPT webでの登録手順

1. `npm run deploy` でWorkerをdeployする。
2. deployed Worker URL の `/mcp` がHTTPSで到達できることを確認する。
3. ChatGPT webでアプリ設定を開く。
4. custom app作成画面でMCP server URLに `https://<deployed-worker-url>/mcp` を入力する。
5. 未レビューMCPのリスク確認が表示される場合は、内容を確認して続行する。
6. 新しい会話でcustom appを有効化し、`ping_piyologを呼んで` のように依頼する。
7. `pong` が返ればPC web側の疎通は成功。
8. スマホブラウザのChatGPT webでも同じcustom appを有効化し、同じ手順で `pong` が返るか確認する。

## MCP Inspectorでの確認

OpenAI Apps SDKのテスト手順では、MCP Inspectorで `List Tools` と `Call Tool` を確認する流れが推奨されています。

```sh
npm run dev
npx @modelcontextprotocol/inspector@latest
```

Inspectorで `/mcp` を指定し、次を確認します。

- `List Tools` に `ping_piyolog` が出る。
- `Call Tool` で `ping_piyolog` を呼ぶと `pong` が返る。

## 現時点の制約

- 認証は未実装。URLを知っている人が呼べる状態なので、家庭データを読むtoolやwrite actionはまだ追加しない。
- `ping_piyolog` はDB・Secrets Store・LLM Gatewayに接続しない。
- ChatGPT webのPC/スマホブラウザでの実機tool call確認は、deploy後に手動で行う。
- OAuthまたは家庭用の許可リスト方式は次以降のissueで設計する。
- write actionを追加する前に、誰が何を保存したか分かるaudit log方針を決める。

## 参考

- [OpenAI Apps SDK: MCP server](https://developers.openai.com/apps-sdk/concepts/mcp-server)
- [OpenAI Apps SDK: Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [OpenAI Apps SDK: Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [OpenAI Apps SDK: Test your integration](https://developers.openai.com/apps-sdk/deploy/testing)
