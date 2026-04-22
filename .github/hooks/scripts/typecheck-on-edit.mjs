#!/usr/bin/env node
// typecheck-on-edit.mjs — PostToolUse hook (non-Windows fallback)
// Runs `tsc --noEmit` when a worker/src/**/*.ts file is edited.

import { execSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let data;
try {
  data = JSON.parse(input);
} catch {
  process.exit(0);
}

const filePath = data?.tool_input?.filePath ?? data?.tool_input?.path ?? "";
if (!/worker[/\\]src[/\\].+\.ts$/.test(filePath)) process.exit(0);

process.stderr.write(
  `[ typecheck ] ${filePath} changed — running tsc --noEmit ...\n`,
);

const workerDir = resolve(__dirname, "../../../worker");
try {
  execSync("npx tsc --noEmit", {
    cwd: workerDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stderr.write("[ typecheck ] tsc OK\n");
  process.exit(0);
} catch (err) {
  const errors =
    err.stdout?.toString() || err.stderr?.toString() || err.message;
  const out = JSON.stringify({
    continue: false,
    stopReason: `TypeScript errors detected — fix before continuing:\n\n${errors.trim()}`,
  });
  process.stdout.write(out);
  process.exit(2);
}
