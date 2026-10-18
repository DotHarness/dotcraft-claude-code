import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const MAX_JOBS = 50;

export function resolveStateDir(workspaceRoot) {
  let realRoot = workspaceRoot;
  try {
    realRoot = fs.realpathSync.native(workspaceRoot);
  } catch {}
  const slug = path.basename(workspaceRoot).replace(/[^\w.-]+/g, "-") || "workspace";
  const hash = createHash("sha256").update(realRoot).digest("hex").slice(0, 16);
  const root = process.env.CLAUDE_PLUGIN_DATA
    ? path.join(process.env.CLAUDE_PLUGIN_DATA, "state")
    : path.join(os.tmpdir(), "dotcraft-companion");
  return path.join(root, `${slug}-${hash}`);
}

function stateFile(workspaceRoot) {
  return path.join(resolveStateDir(workspaceRoot), "state.json");
}

function jobsDir(workspaceRoot) {
  return path.join(resolveStateDir(workspaceRoot), "jobs");
}

export function jobFile(workspaceRoot, jobId) {
  return path.join(jobsDir(workspaceRoot), `${jobId}.json`);
}

export function jobLogFile(workspaceRoot, jobId) {
  return path.join(jobsDir(workspaceRoot), `${jobId}.log`);
}

export function listJobs(workspaceRoot) {
  try {
    const { jobs } = JSON.parse(fs.readFileSync(stateFile(workspaceRoot), "utf8"));
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

export function writeJobs(workspaceRoot, jobs) {
  const kept = jobs.slice(0, MAX_JOBS);
  const keptIds = new Set(kept.map((job) => job.id));
  for (const job of listJobs(workspaceRoot)) {
    if (!keptIds.has(job.id)) {
      fs.rmSync(jobFile(workspaceRoot, job.id), { force: true });
      fs.rmSync(jobLogFile(workspaceRoot, job.id), { force: true });
    }
  }
  fs.mkdirSync(jobsDir(workspaceRoot), { recursive: true });
  fs.writeFileSync(stateFile(workspaceRoot), `${JSON.stringify({ jobs: kept }, null, 2)}\n`);
}

export function readJob(workspaceRoot, jobId) {
  try {
    return JSON.parse(fs.readFileSync(jobFile(workspaceRoot, jobId), "utf8"));
  } catch {
    return null;
  }
}

export function saveJob(workspaceRoot, job) {
  const record = { ...job, updatedAt: new Date().toISOString() };
  fs.mkdirSync(jobsDir(workspaceRoot), { recursive: true });
  fs.writeFileSync(jobFile(workspaceRoot, job.id), `${JSON.stringify(record, null, 2)}\n`);

  const { request, result, ...entry } = record;
  const jobs = listJobs(workspaceRoot);
  const index = jobs.findIndex((existing) => existing.id === job.id);
  if (index === -1) {
    jobs.unshift(entry);
  } else {
    jobs[index] = entry;
  }
  writeJobs(workspaceRoot, jobs);
  return record;
}

export function generateJobId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
