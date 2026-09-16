#!/usr/bin/env node
import { connect } from "@tidbcloud/serverless";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { normalizeDatabaseDateTime } from "./formula-notifier-time.mjs";

const DEFAULT_STATE_FILE = join(
  homedir(),
  "Library",
  "Application Support",
  "piyolog",
  "formula-notifier-state.json",
);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const noSound = args.has("--no-sound");

loadEnvFile(process.env.NOTIFIER_ENV_FILE ?? ".env");
loadEnvFile(".dev.vars");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Put it in .env or export it in the shell.");
}

const notifyBeforeMinutes = parsePositiveInteger(process.env.FORMULA_NOTIFY_BEFORE_MINUTES, 35);
const stateFile = process.env.FORMULA_NOTIFIER_STATE_FILE ?? DEFAULT_STATE_FILE;

const conn = connect({ url: databaseUrl, fullResult: true });
const result = await conn.execute(`
SELECT
  MAX(occurred_at) AS last_formula_at,
  DATE_ADD(MAX(occurred_at), INTERVAL 3 HOUR) AS next_formula_at,
  TIMESTAMPDIFF(
    MINUTE,
    UTC_TIMESTAMP(),
    DATE_ADD(MAX(occurred_at), INTERVAL 3 HOUR)
  ) AS minutes_until_next_formula
FROM piyolog_feed_events
WHERE event_type = 'Formula'
`.trim());

const row = result.rows?.[0];
if (!row?.next_formula_at) {
  log("ミルク記録がないため通知しません。");
  process.exit(0);
}

const nextFormulaAt = normalizeDatabaseDateTime(row.next_formula_at);
const minutesUntilNextFormula = Number(row.minutes_until_next_formula);

if (!Number.isFinite(minutesUntilNextFormula)) {
  throw new Error(`minutes_until_next_formula is not numeric: ${row.minutes_until_next_formula}`);
}

const shouldNotify =
  force || (minutesUntilNextFormula > 0 && minutesUntilNextFormula <= notifyBeforeMinutes);

if (!shouldNotify) {
  log(
    `通知対象外です。次回ミルク予定=${formatForMessage(nextFormulaAt)}、残り${minutesUntilNextFormula}分`,
  );
  process.exit(0);
}

const state = readState(stateFile);
if (!force && state.lastNotifiedNextFormulaAt === nextFormulaAt) {
  log(`通知済みです。次回ミルク予定=${formatForMessage(nextFormulaAt)}`);
  process.exit(0);
}

const message = `もうすぐミルクの時間です。次回予定は${formatTimeForSpeech(nextFormulaAt)}です。`;

if (dryRun) {
  log(`[dry-run] ${message}`);
} else {
  notifyOnMac(message, noSound);
  writeState(stateFile, {
    lastNotifiedNextFormulaAt: nextFormulaAt,
    lastNotifiedAt: new Date().toISOString(),
  });
}

function notifyOnMac(message, skipSound) {
  execFileSync("osascript", [
    "-e",
    `display notification ${quoteAppleScript(message)} with title "ぴよログ" sound name "Glass"`,
  ]);

  if (!skipSound) {
    execFileSync("say", [message]);
  }
}

function readState(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(filePath, state) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

function parsePositiveInteger(value, fallback) {
  if (value == null) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }

  return parsed;
}

function formatForMessage(value) {
  return value.slice(0, 16);
}

function formatTimeForSpeech(value) {
  return value.slice(11, 16);
}

function quoteAppleScript(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function log(message) {
  console.log(`[piyolog-formula-notifier] ${message}`);
}
