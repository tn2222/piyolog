# Architecture

This document describes the planned architecture for the piyolog AI Agent MVP.

## Overview

```mermaid
flowchart LR
  User["User"] --> Slack["Slack"]

  subgraph Piyolog["piyolog Worker"]
    SlackController["Gateway: Slack Controller"]
    AskAssistant["Application: AskAssistantUseCase"]
    ToolExecutor["Application: Tool Execution Flow"]

    subgraph Domain["Domain"]
      ToolDefs["Tool Definitions"]
      Metrics["Metrics / Periods / Rules"]
    end

    subgraph PiyologGateway["Gateway"]
      TidbRepo["TiDB Repository"]
      LlmClient["Personal LLM Gateway Client"]
    end
  end

  subgraph LLMGateway["Personal LLM Gateway\nseparate repository"]
    ApiGateway["AWS API Gateway HTTP API"]
    Lambda["AWS Lambda"]
    LiteLLM["LiteLLM SDK"]
    ModelPolicy["Model Policy"]
  end

  subgraph Providers["LLM Providers"]
    OpenAI["OpenAI"]
    Bedrock["Amazon Bedrock"]
    Anthropic["Anthropic etc."]
  end

  TiDB["TiDB Cloud Serverless"]

  Slack --> SlackController
  SlackController --> AskAssistant
  AskAssistant --> LlmClient
  LlmClient --> ApiGateway
  ApiGateway --> Lambda
  Lambda --> ModelPolicy
  Lambda --> LiteLLM
  LiteLLM --> OpenAI
  LiteLLM --> Bedrock
  LiteLLM --> Anthropic

  Lambda --> LlmClient
  LlmClient --> AskAssistant

  AskAssistant --> ToolExecutor
  ToolExecutor --> ToolDefs
  ToolExecutor --> Metrics
  ToolExecutor --> TidbRepo
  TidbRepo --> TiDB

  ToolExecutor --> AskAssistant
  AskAssistant --> LlmClient
  LlmClient --> ApiGateway
  Lambda --> LlmClient
  AskAssistant --> SlackController
  SlackController --> Slack
```

## Request Flow

```mermaid
sequenceDiagram
  participant U as User
  participant S as Slack
  participant W as piyolog Worker
  participant G as Personal LLM Gateway
  participant L as LiteLLM SDK
  participant M as LLM Provider
  participant DB as TiDB

  U->>S: /piyolog 先週と比べてミルク量増えた？
  S->>W: Slack request
  W->>W: Verify Slack signature / parse command
  W->>G: Tool-selection request
  G->>L: Completion with tool schema
  L->>M: LLM request
  M-->>L: tool_call
  L-->>G: Normalized response
  G-->>W: compare_metric + arguments

  W->>W: Validate tool_call
  W->>DB: SQL for compare_metric
  DB-->>W: Aggregated result

  W->>G: Generate request with tool result
  G->>L: Completion
  L->>M: LLM request
  M-->>L: Answer text
  L-->>G: Normalized response
  G-->>W: Answer text

  W-->>S: Slack response
  S-->>U: Answer
```

## Layer Responsibilities

### Domain

- Defines baby log concepts, metrics, periods, and tool schemas.
- Owns aggregation rules that are independent of Slack, TiDB, or LLM providers.

### Application

- Owns use cases such as `AskAssistantUseCase`.
- Coordinates tool selection, tool validation, tool execution, and answer generation.
- Remains channel-independent so future LINE or Alexa controllers can call the same use case.

### Gateway

- Owns external connections and protocol translation.
- Includes Slack controller, TiDB repository, Personal LLM Gateway client, and HTTP routing.

## Tool Boundary

Tools are defined, validated, and executed inside the piyolog Worker.

Initial tools:

- `compare_metric`: compares a baby-log metric across two periods.
- `summarize_period`: summarizes baby-log records for an arbitrary period.

The Personal LLM Gateway may select a tool and propose arguments, but it must not execute tools or connect to TiDB.

