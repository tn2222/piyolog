# Design MCP read API boundary for the piyolog Agent Core

- **Date**: 2026-06-08
- **Status**: Proposed
- **Related**:
  - [Structure the piyolog AI Agent Worker with Domain, Application, and Gateway layers](./2026-05-31-structure-piyolog-ai-agent-worker.md)
  - [Add LINE gateway adapter for the piyolog AI Agent](./2026-06-07-add-line-gateway-adapter-for-ai-agent.md)
  - [AI Agent MCPインターフェース](../ai-agent/mcp.md)

## Context

ZAWA-81 confirmed that ChatGPT web custom MCP apps can call the deployed piyolog Worker from both PC web and smartphone browser ChatGPT web. The current MCP endpoint only exposes `ping_piyolog`, so it does not read family data or require authentication yet.

The next step is to expose read-only piyolog data to ChatGPT web through MCP. MCP must not become the application core. It should be a ChatGPT-facing adapter over a UI-independent Agent Core / Domain API so that future LINE, PWA, or other interfaces can reuse the same read operations.

Deep conversation, follow-up questions, and hypothesis organization belong to ChatGPT web or another conversation UI. Durable family state, observations, cases, hypotheses, and audit logs belong to the piyolog database.

## Decision

Use MCP as a gateway adapter, not as the source of domain behavior.

The boundary is:

```text
ChatGPT web conversation
  -> MCP tool call
  -> MCP controller / adapter
  -> Agent Core read use case
  -> Query service / repository
  -> TiDB
```

MCP tools translate JSON-RPC tool calls into typed Agent Core inputs and translate typed Agent Core results back into MCP `structuredContent` and text content. They must not contain SQL, LLM prompts, family-data authorization rules, or business rules beyond protocol validation.

Agent Core read use cases own UI-independent application behavior:

- interpreting a typed read request
- enforcing read limits
- choosing the query service or repository
- returning stable structured data

Domain code owns reusable concepts such as dates, metrics, event categories, and tool input schemas. Gateway code owns protocol translation, authentication, and external services such as TiDB and MCP JSON-RPC.

Do not add a generic conversational API such as:

```text
run_agent(message: string)
```

That API would make ChatGPT pass conversation text back into piyolog, blur the UI/application boundary, and encourage piyolog to become another chat orchestrator. ChatGPT is the conversation UI; piyolog exposes explicit read and later write actions.

## Initial read tools

### 1. `get_recent_baby_logs`

This is the first production read tool to implement after `ping_piyolog`.

Purpose: return recent timestamped events and diary journals for a bounded date range.

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

Rules:

- `from` is inclusive and `to` is exclusive.
- The maximum range is 35 days, matching the current `summarize_period` safety limit.
- `includeDiaries` defaults to `true`.
- `eventTypes` is optional. If omitted, all event types are returned.
- The implementation should initially reuse the existing summary period query shape where practical.

Agent Core API draft:

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

Purpose: return saved family observations that can help ChatGPT continue a deep consultation.

Status: deferred until an observations table and write/audit policy exist.

MCP tool input schema draft:

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

Purpose: return a structured, read-only analysis of crying or fussiness context around a target time or date range.

Status: design target for later work. It should be implemented as deterministic analysis over baby logs and saved observations, not as a free-form LLM conversation endpoint.

MCP tool input schema draft:

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

## Tool description policy

Tool descriptions should tell ChatGPT when to call the tool and what the tool returns. They should not include hidden business rules that differ from Agent Core validation.

Recommended first description:

```text
Get recent piyolog baby logs and diary journals for a bounded date range. Use this before answering questions about recent feeding, sleep, diaper, crying, or daily rhythm records.
```

## Authentication and authorization

The read tools must not be added for production family data until the MCP endpoint has an authorization policy. The policy should ensure:

- knowing the URL is not enough to read data
- only the two allowed family users can call read tools
- both users read the same family data
- future write actions can record who performed the action

OAuth is the preferred direction if ChatGPT custom MCP app registration can complete with the chosen provider. A narrower allow-list token may be acceptable for an early private MVP only if it is treated as temporary and documented as such.

## Consequences

### Positive

- MCP remains a thin protocol adapter.
- ChatGPT can do conversation and follow-up questions without piyolog accepting raw conversation text as its API.
- LINE and PWA can reuse Agent Core read use cases without knowing MCP JSON-RPC.
- The first read tool can reuse existing `summarize_period` data access patterns.
- The design leaves a clean path to saved observations and later write actions.

### Negative

- Some ChatGPT prompts will need multiple explicit tool calls instead of one generic `run_agent` call.
- MCP tool schemas and Agent Core input types must be kept aligned.
- Authorization must be solved before exposing real family data.

### Neutral

- `get_recent_baby_logs` and existing `summarize_period` overlap. That is acceptable: `summarize_period` is the current assistant-internal tool shape, while `get_recent_baby_logs` is the ChatGPT-facing read tool name.
- `list_observations` and `analyze_fussiness_context` are intentionally not implemented in the first read-only MVP.
