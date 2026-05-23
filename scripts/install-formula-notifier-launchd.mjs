#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const label = "com.takuyanakazawa.piyolog-formula-notifier";
const plistPath = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const action = process.argv[2];

if (action === "install") {
  install();
} else if (action === "uninstall") {
  uninstall();
} else {
  console.error("Usage: npm run notify:formula:install OR npm run notify:formula:uninstall");
  process.exit(1);
}

function install() {
  mkdirSync(dirname(plistPath), { recursive: true });
  mkdirSync(join(homedir(), "Library", "Logs", "piyolog"), { recursive: true });

  const command = `cd ${shellQuote(repoRoot)} && /usr/bin/env npm run notify:formula`;
  writeFileSync(plistPath, buildPlist(command));

  runLaunchctl(["bootout", `gui/${process.getuid()}`, plistPath], { ignoreError: true });
  runLaunchctl(["bootstrap", `gui/${process.getuid()}`, plistPath]);
  runLaunchctl(["enable", `gui/${process.getuid()}/${label}`]);

  console.log(`installed: ${plistPath}`);
}

function uninstall() {
  if (existsSync(plistPath)) {
    runLaunchctl(["bootout", `gui/${process.getuid()}`, plistPath], { ignoreError: true });
  }

  console.log(`uninstalled: ${plistPath}`);
}

function buildPlist(command) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${escapeXml(command)}</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(homedir(), "Library", "Logs", "piyolog", "formula-notifier.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(homedir(), "Library", "Logs", "piyolog", "formula-notifier.error.log"))}</string>
</dict>
</plist>
`;
}

function runLaunchctl(args, options = {}) {
  try {
    execFileSync("launchctl", args, { stdio: "inherit" });
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
  }
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
