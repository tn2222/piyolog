# AI Agent MCPインターフェース

piyolog AI Agent のインターフェース候補として、ChatGPT web の custom MCP app から呼び出すための最小MCP serverを提供します。

この段階では、ChatGPT webとpiyolog Workerの疎通確認用に `ping_piyolog` を公開し、暫定認可付きで直近の育児ログを読む `get_recent_baby_logs` を公開します。観察メモ保存などのwrite actionはまだ追加しません。

```text
ChatGPT web custom MCP app
  -> POST /mcp
  -> MCP JSON-RPC handler
  -> ping_piyolog / get_recent_baby_logs
  -> pong / 育児ログ
```

## MCP endpoint

ChatGPT custom app には次のURLを登録します。

```text
https://<deployed-worker-url>/mcp
```

`/mcp` だけで登録した場合、公開されるtoolは `ping_piyolog` のみです。育児ログを読むtoolを使うMVP検証では、既存の `INGEST_TOKEN` をquery parameterとして付けたURLを登録します。

```text
https://<deployed-worker-url>/mcp?token=<INGEST_TOKEN>
```

これは初回MVP用の暫定認可です。正式なOAuthや家庭単位の許可リストではありません。

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

### `get_recent_baby_logs`

ChatGPT webから指定期間の時刻付きイベントと育児日記を取得する読み取り専用toolです。`/mcp?token=<INGEST_TOKEN>` で登録された接続にだけ公開されます。

Input schema:

```json
{
  "type": "object",
  "properties": {
    "from": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "to": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "includeDiaries": {
      "type": "boolean"
    },
    "eventTypes": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["from", "to"],
  "additionalProperties": false
}
```

Rules:

- `from` はinclusive、`to` はexclusive。
- 最大範囲は35日。
- `includeDiaries` は未指定なら `true`。
- `eventTypes` は未指定なら全event typeを返す。
- 裸の `/mcp` から `tools/call` された場合は未認可エラーを返す。

Output:

```json
{
  "message": "pong"
}
```

## 読み取りtoolの設計方針

ChatGPT custom MCP appは、`tools/list` で取得したtool metadataをもとに呼び出すtoolを決めます。piyolog Workerの `/mcp` endpointは、`tools/list` にtool metadataを返し、`tools/call` に含まれるtool nameとargumentsを受け取って該当handlerを実行します。

最初の読み取りtool候補は `get_recent_baby_logs` です。ChatGPT webから期間を指定して、ぴよログの時刻付きイベントと育児日記を取得するために使います。

MCP endpoint、Application層の読み取りuse case、Domain層の型・validation、Gateway層のquery serviceの責務分離は [MCP向け読み取りAPI境界のADR](../decisions/2026-06-08-design-mcp-read-api-boundary.md) を参照してください。

## ChatGPT webでの登録手順

1. `npm run deploy` でWorkerをdeployする。
2. deployed Worker URL の `/mcp` がHTTPSで到達できることを確認する。
3. ChatGPT webでアプリ設定を開く。
4. pingだけ確認する場合は、custom app作成画面でMCP server URLに `https://<deployed-worker-url>/mcp` を入力する。
5. 育児ログ読み取りも確認する場合は、MCP server URLに `https://<deployed-worker-url>/mcp?token=<INGEST_TOKEN>` を入力する。
6. 未レビューMCPのリスク確認が表示される場合は、内容を確認して続行する。
7. 新しい会話でcustom appを有効化し、`ping_piyologを呼んで` のように依頼する。
8. `pong` が返ればPC web側の疎通は成功。
9. read toolを登録している場合は、`昨日の育児ログを読んで` のように依頼し、`get_recent_baby_logs` が呼ばれることを確認する。
10. スマホブラウザのChatGPT webでも同じcustom appを有効化し、同じ手順で確認する。

## MCP Inspectorでの確認

OpenAI Apps SDKのテスト手順では、MCP Inspectorで `List Tools` と `Call Tool` を確認する流れが推奨されています。

```sh
npm run dev
npx @modelcontextprotocol/inspector@latest
```

Inspectorで `/mcp` を指定し、次を確認します。

- `List Tools` に `ping_piyolog` が出る。
- `Call Tool` で `ping_piyolog` を呼ぶと `pong` が返る。

`get_recent_baby_logs` を確認する場合は、Inspectorで `/mcp?token=<INGEST_TOKEN>` を指定し、次を確認します。

- `List Tools` に `ping_piyolog` と `get_recent_baby_logs` が出る。
- `Call Tool` で `get_recent_baby_logs` を呼ぶと、指定期間の育児ログが返る。

## 現時点の制約

- `get_recent_baby_logs` の認可は `?token=<INGEST_TOKEN>` による暫定MVP。正式なOAuthや家庭単位の許可リストは未実装。
- `ping_piyolog` はDB・Secrets Store・LLM Gatewayに接続しない。
- `get_recent_baby_logs` はDBとSecrets Storeに接続する。
- ChatGPT webのPC/スマホブラウザでの実機tool call確認は、deploy後に手動で行う。
- OAuthまたは家庭用の許可リスト方式は次以降のissueで設計する。
- write actionを追加する前に、誰が何を保存したか分かるaudit log方針を決める。

## 参考

- [OpenAI Apps SDK: MCP server](https://developers.openai.com/apps-sdk/concepts/mcp-server)
- [OpenAI Apps SDK: Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [OpenAI Apps SDK: Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [OpenAI Apps SDK: Test your integration](https://developers.openai.com/apps-sdk/deploy/testing)
