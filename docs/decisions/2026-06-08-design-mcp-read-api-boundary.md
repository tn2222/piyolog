# MCP向け読み取りAPI境界を設計する

- **Date**: 2026-06-08
- **Status**: Proposed
- **Related**:
  - [piyolog AI Agent WorkerをDomain / Application / Gatewayに分ける](./2026-05-31-structure-piyolog-ai-agent-worker.md)
  - [piyolog AI AgentにLINE Gateway adapterを追加する](./2026-06-07-add-line-gateway-adapter-for-ai-agent.md)
  - [AI Agent MCPインターフェース](../ai-agent/mcp.md)

## Context

最小MCP endpointで、ChatGPT webのcustom MCP appからdeployed piyolog Workerを呼び出せることを確認した。PC webとスマホブラウザのChatGPT webの両方で `ping_piyolog` が呼べている。

次の段階では、ChatGPT webからぴよログ由来の育児ログを読み取れるようにする。ただし、MCP serverをpiyolog AI Agentの本体にしてしまうと、ChatGPT向けの都合がそのまま業務ロジックやDBアクセスに入り込みやすい。

ChatGPT custom MCP appでは、ChatGPTがMCP serverの `tools/list` から取得したtool metadataをもとに、ユーザー発話に対して呼び出すtoolを決める。piyolog Workerの `/mcp` endpointは、ChatGPTから送られる `tools/list` にtool metadataを返し、`tools/call` に含まれるtool nameとargumentsを受け取って該当handlerを実行する。

この構造は、既存のSlack / LINE向けAI Agentとはtool selectionの位置が異なる。Slack / LINEではpiyolog側の `AskAssistantUseCase` がLLM Gatewayへtool selectionを依頼する。一方、ChatGPT MCPではChatGPT自身がMCP tool metadataを見てtoolを選ぶため、piyolog側でさらにLLM Gatewayへtool selectionを依頼する必要はない。

そのため、読み取りtoolを追加するときは、MCP endpoint内に業務ロジックやDB queryを直接増やすのではなく、既存のDomain / Application / Gatewayの考え方に沿って次の境界に分ける。

- **MCP controller / handler**: `tools/list` と `tools/call` を処理し、tool nameごとのhandlerへdispatchする。
- **Application層の読み取りuse case**: `getRecentBabyLogs` のように、MCPに依存しない入力を受け取り、読み取り制限やquery serviceの選択を行う関数。
- **Domain層の型・schema・validation**: 日付範囲、指標、event typeなど、MCP / LINE / PWAに依存しない共通の概念。
- **Gateway層のquery service / repository interface**: TiDBからイベントや日記を読むためのinterface。実装はTiDBに依存してよいが、use caseからはinterface越しに扱う。

深い相談の会話文脈、追加質問、仮説整理はChatGPT webなどの会話UI側に置く。一方で、保存すべき家庭データ、観察メモ、ケース、仮説、audit logはpiyolog側DBに置く。

## Decision

読み取りtoolを追加するとき、piyolog Workerの `/mcp` endpointはMCP protocolの入口として扱う。`/mcp` はtool metadataを返し、ChatGPTから指定されたtool nameとargumentsを受け取り、該当するhandlerへdispatchする。

境界は次の形にする。

```text
ChatGPT webの会話
  -> ChatGPTがMCP tool metadataを見てtoolを選択
  -> POST /mcp tools/call
  -> MCP controllerがtool nameでhandlerへdispatch
  -> Application層の読み取りuse case
  -> Query service / repository interface
  -> TiDB
```

MCP controllerの責務は、MCP JSON-RPCの `tools/list` / `tools/call` を処理し、typedなuse case inputへ変換し、use case resultをMCPの `structuredContent` とtext contentへ戻すことに限定する。

MCP controllerには次を置かない。

- SQL
- LLM prompt
- 育児ログの集計・分析ルール
- 家族データの認可判断そのもの
- ChatGPT向けの会話状態管理
- LLM Gatewayへのtool selection依頼

Application層の読み取りuse caseには次を置く。

- typedな読み取りrequestの解釈
- 日付範囲などの読み取り制限
- query service / repositoryの選択
- UI非依存で安定した戻り値の生成

Domain層には次を置く。

- date range
- metric
- event type
- tool input schema
- validation helper

Gateway層には次を置く。

- MCP JSON-RPC controller / handler
- Slack / LINEなどのcontroller
- TiDB query service / repository実装
- 認証・認可のprotocol連携

次のような会話APIはpiyolog本体には追加しない。

```text
run_agent(message: string)
```

このAPIを追加すると、ChatGPTが持っている会話文脈をpiyologへ再投入する形になり、piyologがもう1つのチャットオーケストレーターになってしまう。ChatGPT webは会話UIであり、piyologは明示的な読み取りactionと、将来の保存actionを提供する。

## 最初に公開する読み取りtool

### 1. `get_recent_baby_logs`

`ping_piyolog` の次に実装する最初のproduction read toolとする。

目的は、指定された日付範囲の時刻付きイベントと育児日記を返すこと。ChatGPT webが「昨日のミルク」「最近の睡眠」「今日のぐずり前後」などを相談する前に、まず事実データを取得するために使う。

MCP tool input schema:

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

ルール:

- `from` はinclusive、`to` はexclusiveとする。
- 最大範囲は35日とする。既存の `summarize_period` の安全上限に合わせる。
- `includeDiaries` は未指定なら `true` とする。
- `eventTypes` は任意。未指定なら全event typeを返す。
- 実装時は、可能な範囲で既存の `SummaryPeriodQueryServiceInterface` のquery shapeを再利用する。

Application層のuse case input / result案:

```ts
type GetRecentBabyLogsInput = {
  range: { from: string; to: string };
  includeDiaries: boolean;
  eventTypes: string[] | null;
};

type GetRecentBabyLogsResult = {
  range: { from: string; to: string };
  days: {
    date: string;
    events: Record<string, unknown>[];
    journal: string | null;
  }[];
};
```

### 2. `list_observations`

保存済みの家庭内観察メモを返すtool。深い相談を続けるときに、ChatGPTが過去の観察メモを参照するために使う。

ただし、観察メモ用table、write action、audit log方針がまだないため、初回のread-only MVPでは実装しない。

MCP tool input schema案:

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
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "additionalProperties": false
}
```

### 3. `analyze_fussiness_context`

ギャン泣き・寝ぐずりなどの対象日時の前後ログを読み、原因候補を断定せず、確認順や不足情報を構造化して返すtool。

これは自由文のLLM会話APIではなく、育児ログと保存済み観察メモに対する deterministic な読み取り・分析use caseとして実装する。初回のread-only MVPでは設計候補に留める。

MCP tool input schema案:

```json
{
  "type": "object",
  "properties": {
    "targetDate": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "targetTime": {
      "type": "string",
      "pattern": "^\\d{2}:\\d{2}$"
    },
    "windowHours": {
      "type": "number",
      "minimum": 1,
      "maximum": 12
    }
  },
  "required": ["targetDate"],
  "additionalProperties": false
}
```

## Tool description方針

Tool descriptionには、ChatGPTがそのtoolをいつ呼ぶべきか、何が返るかを書く。Application層やDomain層のvalidationと異なる隠れルールは書かない。

`get_recent_baby_logs` のdescription案:

```text
Get recent piyolog baby logs and diary journals for a bounded date range. Use this before answering questions about recent feeding, sleep, diaper, crying, or daily rhythm records.
```

## 認証・認可

家庭データを読むtoolは、URLを知っているだけで呼べる裸の `/mcp` には公開しない。

最初のMVPでは、既存の `INGEST_TOKEN` をquery parameterとして受け取る `https://<deployed-worker-url>/mcp?token=<INGEST_TOKEN>` だけに `get_recent_baby_logs` を公開する。裸の `/mcp` では `ping_piyolog` のみを公開し、`get_recent_baby_logs` の `tools/call` は未認可エラーにする。

これはMVP用の暫定認可であり、正式な家庭単位の認可ではない。token付きURLをChatGPT custom appへ登録できるかを確認するための実装と位置づける。

認可方針は最低限次を満たす必要がある。

- URLを知っているだけでは読めない。
- 許可された2人だけがread toolを呼べる。
- 2人は同じ家庭データを読む。
- 将来のwrite actionで、誰が何を保存したかaudit logに残せる。

ChatGPT custom MCP app登録で問題なく使えるならOAuthを優先する。私的MVPとして一時的にtoken方式を使う場合も、write actionへ進む前に再検討する。

## Consequences

### Positive

- MCP endpointを薄いprotocol入口として保てる。
- ChatGPTが会話と追加質問を担当しつつ、piyologは明示的な読み取りactionを提供できる。
- LINEやPWAからも、同じApplication層の読み取りuse caseを再利用しやすい。
- 最初の読み取りtoolは既存の `summarize_period` 系queryを流用しやすい。
- 保存済み観察メモやwrite actionへ進む道筋を残せる。

### Negative

- 汎用 `run_agent` より、toolごとのschemaとuse caseを維持する手間が増える。
- MCP tool schemaとApplication層のinput typeを同期して保つ必要がある。
- 暫定token方式では、token付きURLの扱いに注意が必要になる。
- write actionへ進む前に、OAuthまたは家庭単位の許可リストへ移行する必要がある。

### Neutral

- `get_recent_baby_logs` と既存の `summarize_period` は役割が一部重なる。`summarize_period` は既存assistant内部のtool名、`get_recent_baby_logs` はChatGPT-facingな読み取りtool名として扱う。
- `list_observations` と `analyze_fussiness_context` は、最初のread-only MVPでは実装しない。
