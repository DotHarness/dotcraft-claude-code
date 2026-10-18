import fs from "node:fs";
import process from "node:process";

import { runDotcraft, terminateProcessTree } from "./process.mjs";
import { jobLogFile, listJobs, readJob, saveJob } from "./state.mjs";

export const SESSION_ID_ENV = "DOTCRAFT_COMPANION_SESSION_ID";

const PROGRESS_LINE = /^\[(\d{4}-\d\d-\d\dT[^\]]+)\] (.*)$/;

export function nowIso() {
  return new Date().toISOString();
}

export function isActive(job) {
  return job.status === "queued" || job.status === "running";
}

export function currentSessionId() {
  return process.env[SESSION_ID_ENV] || null;
}

export function sessionJobs(workspaceRoot) {
  const sessionId = currentSessionId();
  const jobs = listJobs(workspaceRoot);
  return sessionId ? jobs.filter((job) => job.sessionId === sessionId) : jobs;
}

export function appendLog(workspaceRoot, jobId, message) {
  fs.appendFileSync(jobLogFile(workspaceRoot, jobId), `[${nowIso()}] ${message}\n`);
}

export function appendRawLog(workspaceRoot, jobId, text) {
  fs.appendFileSync(jobLogFile(workspaceRoot, jobId), text);
}

export function readProgress(workspaceRoot, jobId, limit = Infinity) {
  let text = "";
  try {
    text = fs.readFileSync(jobLogFile(workspaceRoot, jobId), "utf8");
  } catch {
    return [];
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.match(PROGRESS_LINE)?.[2])
    .filter(Boolean);
  return limit === Infinity ? lines : lines.slice(-limit);
}

export function findJob(jobs, reference) {
  const exact = jobs.find((job) => job.id === reference);
  if (exact) {
    return exact;
  }
  const matches = jobs.filter((job) => job.id.startsWith(reference));
  if (matches.length > 1) {
    throw new Error(`Job reference "${reference}" matches several jobs. Use a longer job id.`);
  }
  if (matches.length === 0) {
    throw new Error(`No DotCraft job found for "${reference}". Run /dotcraft:status to list jobs.`);
  }
  return matches[0];
}

export function latestResumableTask(jobs) {
  return jobs.find((job) => job.kind === "task" && job.threadId && !isActive(job)) ?? null;
}

export async function stopJob(workspaceRoot, job) {
  let interrupt = null;
  if (job.threadId) {
    const outcome = await runDotcraft(["exec", "interrupt", job.threadId], { cwd: workspaceRoot });
    const detail = outcome.stderr.trim().split(/\r?\n/).pop() ?? "";
    interrupt = { interrupted: outcome.status === 0, detail };
  }
  terminateProcessTree(job.pid);
  return interrupt;
}

export async function cancelJob(workspaceRoot, job) {
  const interrupt = await stopJob(workspaceRoot, job);
  if (interrupt) {
    appendLog(
      workspaceRoot,
      job.id,
      interrupt.interrupted ? `Interrupted DotCraft thread ${job.threadId}.` : `Could not interrupt DotCraft thread ${job.threadId}: ${interrupt.detail}`
    );
  }
  appendLog(workspaceRoot, job.id, "Cancelled by user.");
  const latest = readJob(workspaceRoot, job.id) ?? job;
  const cancelled = saveJob(workspaceRoot, {
    ...latest,
    status: "cancelled",
    phase: "cancelled",
    pid: null,
    errorMessage: "Cancelled by user.",
    completedAt: nowIso()
  });
  return { job: cancelled, interrupt };
}
