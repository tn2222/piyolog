# Add LINE as a Gateway Adapter for the piyolog AI Agent

- **Date**: 2026-06-07
- **Status**: Proposed
- **Related**: [Structure the piyolog AI Agent Worker with Domain, Application, and Gateway layers](./2026-05-31-structure-piyolog-ai-agent-worker.md)

## Context

- 現在 Slack からのみ利用できる piyolog AI Agent を LINE からも使えるようにする。
- 既存の AI Agent は `askAssistant` を Application 層に置き、Slack 固有の処理は Gateway 層の controller に閉じている。
- LINE からの利用は個人利用を前提とする。今回のスコープでは `familyId`、`childId`、LINE user と家庭・子どもの紐付け、複数家庭向けの権限管理は追加しない。
- LINE の通常チャットメッセージを受け取り、既存の単一家庭データソースに対する質問として扱う。
- LINE webhook では、LINE から来た request であることを raw body と `x-line-signature` で検証する必要がある。
- 今回必要な LINE 機能は webhook 受信、text event 抽出、reply API による text reply に限られる。

## Decision

- piyolog Worker に `/api/line/webhook` を新設し、LINE Messaging API の webhook 入口にする。
- Gateway 層に `lineController` を追加し、LINE 固有の method validation、署名検証、payload parse、text event 抽出、reply API 呼び出しを閉じ込める。
- `lineController` は text message event の本文を既存の `askAssistant(text)` に渡す。
- Application 層と Domain 層は変更せず、Slack と LINE の両方から同じ AI Agent use case を利用する。
- LINE SDK は導入しない。今回必要な LINE 機能は webhook 受信、署名検証、text reply に限られるため、Cloudflare Worker 標準の Web Crypto API と `fetch` で小さく実装する。
- LINE user と家庭・子どもの紐付けは今回実装しない。将来必要になった場合は、LINE user を解決してから `askAssistant` に家庭・子どもの識別子を渡す形に拡張する。

## Consequences

### Positive

- Slack 以外の UI からも既存の piyolog AI Agent を利用できる。
- `askAssistant` をチャネル非依存に保ったまま、LINE 固有処理を Gateway 層に閉じ込められる。
- LINE SDK を入れないため、Cloudflare Worker runtime との互換性確認や依存追加を避けられる。
- 実装対象を text message reply に絞ることで、LINE UI 追加のスコープを小さく保てる。
- 将来 `familyId` / `childId` が必要になった場合も、LINE controller と `askAssistant` の間に user 解決処理を挟む余地が残る。

### Negative

- LINE API の request/response 形式、署名検証、reply API 呼び出しを自前で実装・テストする必要がある。
- SDK を使わないため、将来 rich menu、LIFF、画像、音声、push message など LINE 固有機能が増えた場合は、追加の client abstraction や SDK 導入を再検討する必要がある。
- 個人利用前提のため、複数家庭・複数ユーザー運用を始める場合は認可モデルとデータ絞り込みを後から設計する必要がある。

### Neutral

- `/api/line/webhook` は piyolog Worker に新しく生やす inbound API である。
- LINE の reply API は、webhook event の `replyToken` を使ってユーザーへ返信する outbound API である。
- text 以外の LINE event は MVP では無視する。
- LINE Console の疎通確認などで `events` が空の場合は成功応答として扱う。

## Notes

- 実装 plan: `docs/superpowers/plans/2026-06-07-line-ai-agent-implementation-plan.md`
- LINE webhook flow:
  - LINE user の通常チャット
  - LINE Platform
  - `POST /api/line/webhook`
  - `lineController`
  - `askAssistant`
  - LINE reply API
  - LINE user に返信
- 検討した代替案:
  - LINE SDK 導入: 今回の範囲では webhook 受信、署名検証、text reply だけであり、必要な LINE API surface が小さい。Cloudflare Worker は Web 標準 API 中心の runtime なので、Node.js 向け SDK を入れると互換性確認と依存管理のコストが増える。現時点では SDK の抽象化より、`lineController` 内で request/response を明示的に扱う方が実装とテストの範囲を小さく保てるため採用しない。
  - `familyId` / `childId` と LINE user mapping の同時実装: 個人利用前提では不要で、LINE UI 追加のスコープが大きくなるため採用しない。
