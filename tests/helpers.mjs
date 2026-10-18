import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { saveJob } from "../plugins/dotcraft/scripts/lib/state.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const COMPANION = path.join(ROOT, "plugins", "dotcraft", "scripts", "dotcraft-companion.mjs");
export const SESSION_HOOK = path.join(ROOT, "plugins", "dotcraft", "scripts", "session-lifecycle-hook.mjs");
const FAKE = path.join(ROOT, "tests", "fake-dotcraft.mjs");

export function makeTempDir() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "dotcraft-plugin-test-")));
}

export function makeWorkspace() {
  const workspace = makeTempDir();
  fs.mkdirSync(path.join(workspace, ".craft"));
  return workspace;
}

export function installFakeDotcraft(scenario = {}) {
  const binDir = makeTempDir();
  fs.writeFileSync(path.join(binDir, "scenario.json"), JSON.stringify(scenario));
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(binDir, "dotcraft.cmd"), `@"${process.execPath}" "${FAKE}" "${binDir}" %*\r\n`);
  } else {
    fs.writeFileSync(path.join(binDir, "dotcraft"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "${binDir}" "$@"\n`, { mode: 0o755 });
  }
  return binDir;
}

export function readCalls(binDir) {
  const file = path.join(binDir, "calls.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
}

function pathKey() {
  return Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
}

export function buildEnv({ binDir = null, pluginData, sessionId = null, pathValue = null, extra = {} }) {
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: pluginData, ...extra };
  delete env.DOTCRAFT_COMPANION_SESSION_ID;
  if (sessionId) {
    env.DOTCRAFT_COMPANION_SESSION_ID = sessionId;
  }
  const key = pathKey();
  env[key] = pathValue ?? (binDir ? `${binDir}${path.delimiter}${process.env[key]}` : process.env[key]);
  return env;
}

export function companion(args, { cwd, env, input = "" }) {
  return spawnSync(process.execPath, [COMPANION, ...args], { cwd, env, input, encoding: "utf8", windowsHide: true });
}

export function runHook(event, input, env) {
  return spawnSync(process.execPath, [SESSION_HOOK, event], { env, input: JSON.stringify(input), encoding: "utf8", windowsHide: true });
}

export function startSleeper() {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return child.pid;
}

export function deadPid() {
  return spawnSync(process.execPath, ["-e", ""]).pid;
}

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function kill(pid) {
  try {
    process.kill(pid);
  } catch {}
}

export async function waitFor(predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition.");
}

export function seedJobs(pluginData, workspace, jobs) {
  process.env.CLAUDE_PLUGIN_DATA = pluginData;
  for (const job of [...jobs].reverse()) {
    saveJob(workspace, { kind: "task", title: "DotCraft Task", summary: job.id, createdAt: new Date().toISOString(), ...job });
  }
}
