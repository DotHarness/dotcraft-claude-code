#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { isActive, SESSION_ID_ENV, stopJob } from "./lib/jobs.mjs";
import { listJobs, writeJobs } from "./lib/state.mjs";

function readInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function appendEnv(name, value) {
  if (process.env.CLAUDE_ENV_FILE && value) {
    fs.appendFileSync(process.env.CLAUDE_ENV_FILE, `export ${name}='${String(value).replace(/'/g, `'"'"'`)}'\n`);
  }
}

async function endSession(input) {
  const sessionId = input.session_id || process.env[SESSION_ID_ENV];
  if (!sessionId) {
    return;
  }
  const workspaceRoot = path.resolve(input.cwd || process.cwd());
  const jobs = listJobs(workspaceRoot);
  const ending = jobs.filter((job) => job.sessionId === sessionId);
  await Promise.all(ending.filter(isActive).map((job) => stopJob(workspaceRoot, job)));
  if (ending.length > 0) {
    writeJobs(workspaceRoot, listJobs(workspaceRoot).filter((job) => job.sessionId !== sessionId));
  }
}

const input = readInput();
const event = process.argv[2] ?? input.hook_event_name;
if (event === "SessionStart") {
  appendEnv(SESSION_ID_ENV, input.session_id);
  appendEnv("CLAUDE_PLUGIN_DATA", process.env.CLAUDE_PLUGIN_DATA);
} else if (event === "SessionEnd") {
  await endSession(input);
}
