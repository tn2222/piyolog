# Piyolog Text Export Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google Drive text export ingestion path that stores raw Piyolog text exports and normalizes all timestamped text rows into `piyolog_events`.

**Architecture:** Keep the existing JSON endpoint as a fallback. Add `POST /api/text-records` for Apps Script to submit `{ source, fileId, fileName, updatedAt, text }`. Store raw text in a new table, parse timestamped rows into events with Japanese `event_type`, and replace `piyolog_events` by dates present in the text export.

**Tech Stack:** Cloudflare Workers, TypeScript, Vitest, TiDB Cloud Serverless, Google Apps Script.

---

### Task 1: Text Export Parser

**Files:**
- Create: `src/piyologText.ts`
- Create: `test/piyologText.test.ts`

- [x] Write failing tests for parsing Piyolog text export date sections and timestamped rows.
- [x] Run `npm test -- test/piyologText.test.ts` and verify failures.
- [x] Implement `parsePiyologTextEvents(text)` and `parsePiyologTextEventDates(text)`.
- [x] Run `npm test -- test/piyologText.test.ts` and verify pass.

### Task 2: Raw Text Repository

**Files:**
- Modify: `src/types.ts`
- Modify: `src/repository.ts`
- Modify: `test/repository.test.ts`
- Create: `migrations/003_create_raw_piyolog_text_exports.sql`

- [x] Write failing repository tests for inserting raw text exports.
- [x] Run `npm test -- test/repository.test.ts` and verify failures.
- [x] Add `insertTextExport` to the repository interface and TiDB implementation.
- [x] Add migration for `raw_piyolog_text_exports`.
- [x] Run `npm test -- test/repository.test.ts` and verify pass.

### Task 3: Text Records Endpoint

**Files:**
- Modify: `src/handler.ts`
- Modify: `src/index.ts`
- Modify: `test/handler.test.ts`
- Modify: `test/index.test.ts`

- [x] Write failing tests for `POST /api/text-records`.
- [x] Run endpoint tests and verify failures.
- [x] Implement text request validation, raw text save, event-date replacement, and event insertion.
- [x] Route `/api/text-records` in `src/index.ts`.
- [x] Run endpoint tests and verify pass.

### Task 4: Apps Script and Documentation

**Files:**
- Create: `apps-script/Code.gs`
- Create: `apps-script/README.md`
- Modify: `README.md`

- [x] Add Apps Script that polls a Drive folder, POSTs updated files to Worker, and records `fileId:updatedAt` in `PropertiesService`.
- [x] Document Script Properties and trigger setup in Japanese.
- [x] Run all tests and typecheck.
