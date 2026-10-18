#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs, splitRawArguments } from "./lib/args.mjs";
import { runExec } from "./lib/exec.mjs";
import {
  appendLog,
  appendRawLog,
  cancelJob,
  currentSessionId,
  findJob,
  isActive,
  latestResumableTask,
  nowIso,
  readProgress,
  sessionJobs
} from "./lib/jobs.mjs";
import { runDotcraft } from "./lib/process.mjs";
import { renderCancel, renderJobStatus, renderResult, renderSetup, renderStatus } from "./lib/render.mjs";
import { generateJobId, listJobs, readJob, saveJob } from "./lib/state.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const CONTINUE_PROMPT = "Continue the previous task.";
const STATUS_TIMEOUT_MS = 240000;
const STATUS_POLL_MS = 1000;
const RECENT_JOBS = 8;
const ACTIVE_PROGRESS_LINES = 4;

function output(payload, rendered, asJson) {
  process.stdout.write(asJson ? `${JSON.stringify(payload, null, 2)}\n` : rendered);
}

function workspaceOf(options) {
  return path.resolve(options.cwd ?? process.cwd());
}

function rawArgs(argv) {
  return argv.length === 1 ? splitRawArguments(argv[0]) : argv;
}

function shorten(text, limit = 96) {
  const flat = String(text ?? "").trim().replace(/\s+/g, " ");
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 3)}...`;
}

function readPrompt(cwd, options, positionals) {
  if (options["prompt-file"]) {
    return fs.readFileSync(path.resolve(cwd, options["prompt-file"]), "utf8");
  }
  if (positionals.length > 0) {
    return positionals.join(" ");
  }
  return process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8");
}

function resolveResumeThread(workspaceRoot) {
  const jobs = sessionJobs(workspaceRoot);
  const active = jobs.find((job) => job.kind === "task" && isActive(job));
  if (active) {
    throw new Error(`Task ${active.id} is still running. Use /dotcraft:status before continuing it.`);
  }
  const previous = latestResumableTask(jobs);
  if (!previous) {
    throw new Error("No previous DotCraft task thread was found for this session.");
  }
  return previous.threadId;
}

async function runJob(workspaceRoot, job, { stderr }) {
  let record = saveJob(workspaceRoot, { ...job, status: "running", phase: "starting", pid: process.pid, startedAt: nowIso() });
  appendLog(workspaceRoot, job.id, `Starting ${job.title}.`);

  const run = await runExec(record.request, {
    onThread(threadId) {
      record = saveJob(workspaceRoot, { ...(readJob(workspaceRoot, job.id) ?? record), threadId });
    },
    onProgress({ phase, message }) {
      appendLog(workspaceRoot, job.id, message);
      if (stderr) {
        process.stderr.write(`[dotcraft] ${message}\n`);
      }
      if (phase !== record.phase) {
        record = saveJob(workspaceRoot, { ...(readJob(workspaceRoot, job.id) ?? record), phase });
      }
    },
    onStderr(chunk) {
      appendRawLog(workspaceRoot, job.id, chunk);
    }
  });

  appendLog(workspaceRoot, job.id, run.status === "completed" ? "Completed." : `Failed: ${run.error}`);
  return saveJob(workspaceRoot, {
    ...(readJob(workspaceRoot, job.id) ?? record),
    status: run.status,
    phase: run.status === "completed" ? "done" : "failed",
    pid: null,
    threadId: run.threadId,
    result: { answer: run.answer, images: run.images, threadId: run.threadId },
    errorMessage: run.error,
    completedAt: nowIso()
  });
}

function startWorker(workspaceRoot, jobId) {
  const child = spawn(process.execPath, [SCRIPT_PATH, "task-worker", "--cwd", workspaceRoot, "--job-id", jobId], {
    cwd: workspaceRoot,
    env: process.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

async function handleTask(argv) {
  const { options, positionals } = parseArgs(argv, {
    values: ["cwd", "model", "prompt-file", "kind"],
    lists: ["image"],
    booleans: ["json", "background", "resume-last", "fresh", "auto-approve"],
    aliases: { resume: "resume-last" }
  });
  if (options.kind && options.kind !== "image") {
    throw new Error(`Unsupported --kind "${options.kind}". The only kind is image.`);
  }
  const resume = Boolean(options["resume-last"]);
  if (resume && options.fresh) {
    throw new Error("Choose either --resume-last or --fresh.");
  }

  const workspaceRoot = workspaceOf(options);
  const prompt = readPrompt(workspaceRoot, options, positionals).trim();
  if (!prompt && !resume) {
    throw new Error("Provide a prompt as text, with --prompt-file, or on stdin.");
  }
  const threadId = resume ? resolveResumeThread(workspaceRoot) : null;
  const kind = options.kind ?? "task";
  const sessionId = currentSessionId();

  const job = {
    id: generateJobId(),
    kind,
    title: kind === "image" ? "DotCraft Image" : resume ? "DotCraft Resume" : "DotCraft Task",
    summary: shorten(prompt || CONTINUE_PROMPT),
    status: "queued",
    phase: "queued",
    ...(sessionId ? { sessionId } : {}),
    pid: null,
    threadId,
    request: {
      cwd: workspaceRoot,
      prompt: prompt || CONTINUE_PROMPT,
      threadId,
      model: options.model ?? null,
      images: options.image.map((image) => path.resolve(workspaceRoot, image)),
      autoApprove: Boolean(options["auto-approve"])
    },
    createdAt: nowIso()
  };

  if (options.background) {
    saveJob(workspaceRoot, job);
    appendLog(workspaceRoot, job.id, "Queued for background run.");
    const pid = startWorker(workspaceRoot, job.id);
    const queued = saveJob(workspaceRoot, { ...(readJob(workspaceRoot, job.id) ?? job), pid });
    output(
      { jobId: queued.id, status: queued.status, title: queued.title, summary: queued.summary },
      `${queued.title} started in the background as ${queued.id}. Check /dotcraft:status ${queued.id} for progress.\n`,
      options.json
    );
    return;
  }

  const finished = await runJob(workspaceRoot, job, { stderr: !options.json });
  output(finished, renderResult(finished), options.json);
  if (finished.status !== "completed") {
    process.exitCode = 1;
  }
}

async function handleTaskWorker(argv) {
  const { options } = parseArgs(argv, { values: ["cwd", "job-id"] });
  const workspaceRoot = workspaceOf(options);
  const job = readJob(workspaceRoot, options["job-id"]);
  if (!job) {
    throw new Error(`No stored job found for ${options["job-id"]}.`);
  }
  if (job.status !== "queued") {
    return;
  }
  await runJob(workspaceRoot, job, { stderr: false });
}

function withProgress(workspaceRoot, job, limit) {
  return { ...job, progress: readProgress(workspaceRoot, job.id, limit) };
}

async function handleStatus(argv) {
  const { options, positionals } = parseArgs(rawArgs(argv), {
    values: ["cwd", "timeout-ms"],
    booleans: ["json", "wait", "all"]
  });
  const workspaceRoot = workspaceOf(options);
  const reference = positionals[0];

  if (reference) {
    let job = findJob(listJobs(workspaceRoot), reference);
    const deadline = Date.now() + Number(options["timeout-ms"] ?? STATUS_TIMEOUT_MS);
    while (options.wait && isActive(job) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(STATUS_POLL_MS, Math.max(0, deadline - Date.now()))));
      job = findJob(listJobs(workspaceRoot), job.id);
    }
    const waitTimedOut = Boolean(options.wait) && isActive(job);
    const record = readJob(workspaceRoot, job.id) ?? job;
    const progress = readProgress(workspaceRoot, job.id);
    output({ job: { ...record, progress }, waitTimedOut }, renderJobStatus(record, progress, waitTimedOut), options.json);
    return;
  }
  if (options.wait) {
    throw new Error("status --wait needs a job id.");
  }

  const jobs = sessionJobs(workspaceRoot);
  const active = jobs.filter(isActive).map((job) => withProgress(workspaceRoot, job, ACTIVE_PROGRESS_LINES));
  const finished = jobs.filter((job) => !isActive(job));
  const latestFinished = finished[0] ?? null;
  const recent = (options.all ? finished : jobs.slice(0, RECENT_JOBS).filter((job) => !isActive(job))).filter(
    (job) => job.id !== latestFinished?.id
  );
  const snapshot = { workspaceRoot, active, latestFinished, recent };
  output(snapshot, renderStatus(snapshot), options.json);
}

function handleResult(argv) {
  const { options, positionals } = parseArgs(rawArgs(argv), { values: ["cwd"], booleans: ["json"] });
  const workspaceRoot = workspaceOf(options);
  const reference = positionals[0];
  const jobs = reference ? [findJob(listJobs(workspaceRoot), reference)] : sessionJobs(workspaceRoot);
  const job = jobs.find((entry) => !isActive(entry)) ?? jobs[0];
  if (!job) {
    throw new Error("No finished DotCraft job was found for this session.");
  }
  if (isActive(job)) {
    throw new Error(`Job ${job.id} is still ${job.status}. Check /dotcraft:status and try again once it finishes.`);
  }
  const record = readJob(workspaceRoot, job.id) ?? job;
  output(record, renderResult(record), options.json);
}

async function handleCancel(argv) {
  const { options, positionals } = parseArgs(rawArgs(argv), { values: ["cwd"], booleans: ["json"] });
  const workspaceRoot = workspaceOf(options);
  const reference = positionals[0];
  let job;
  if (reference) {
    job = findJob(listJobs(workspaceRoot), reference);
    if (!isActive(job)) {
      throw new Error(`Job ${job.id} is already ${job.status}.`);
    }
  } else {
    const active = sessionJobs(workspaceRoot).filter(isActive);
    if (active.length > 1) {
      throw new Error("Multiple DotCraft jobs are active. Pass a job id to /dotcraft:cancel.");
    }
    if (active.length === 0) {
      throw new Error("No active DotCraft job to cancel.");
    }
    job = active[0];
  }

  const outcome = await cancelJob(workspaceRoot, job);
  output(
    { jobId: outcome.job.id, status: outcome.job.status, threadId: outcome.job.threadId ?? null, interrupt: outcome.interrupt },
    renderCancel(outcome),
    options.json
  );
}

function handleTaskResumeCandidate(argv) {
  const { options } = parseArgs(argv, { values: ["cwd"], booleans: ["json"] });
  const candidate = latestResumableTask(sessionJobs(workspaceOf(options)));
  const payload = {
    available: Boolean(candidate),
    sessionId: currentSessionId(),
    candidate: candidate && {
      id: candidate.id,
      status: candidate.status,
      title: candidate.title,
      summary: candidate.summary,
      threadId: candidate.threadId,
      completedAt: candidate.completedAt ?? null
    }
  };
  output(
    payload,
    candidate ? `DotCraft thread ${candidate.threadId} from ${candidate.id} can be continued.\n` : "No DotCraft thread to continue in this session.\n",
    options.json
  );
}

function bundledBinaryPath() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Programs", "DotCraft", "resources", "bin", "dotcraft.exe");
  }
  if (process.platform === "darwin") {
    return "/Applications/DotCraft.app/Contents/Resources/bin/dotcraft";
  }
  return "/opt/DotCraft/resources/bin/dotcraft";
}

function findOnPath(command) {
  const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension.toLowerCase()}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

function nodeSupported() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return major > 18 || (major === 18 && minor >= 18);
}

async function handleSetup(argv) {
  const { options } = parseArgs(argv, { values: ["cwd"], booleans: ["json"] });
  const root = workspaceOf(options);
  const nextSteps = [];

  if (!nodeSupported()) {
    nextSteps.push("Install Node.js 18.18 or later.");
  }

  const version = await runDotcraft(["--version"], { cwd: root });
  const available = version.status === 0;
  const dotcraft = {
    available,
    version: available ? version.stdout.trim() : null,
    path: available ? findOnPath("dotcraft") : null,
    bundledPath: null
  };
  if (!available) {
    const bundled = bundledBinaryPath();
    if (fs.existsSync(bundled)) {
      dotcraft.bundledPath = bundled;
      nextSteps.push(`Add ${path.dirname(bundled)} to your PATH, then restart Claude Code.`);
    } else {
      nextSteps.push("Install DotCraft: https://github.com/DotHarness/dotcraft");
    }
  }

  const workspace = { root, hasCraft: fs.existsSync(path.join(root, ".craft")) };
  if (!workspace.hasCraft) {
    nextSteps.push(`Open ${root} in DotCraft Desktop, or run \`dotcraft setup\` in it.`);
  }

  const report = { ready: nextSteps.length === 0, node: process.version, dotcraft, workspace, nextSteps };
  output(report, renderSetup(report), options.json);
}

const handlers = {
  setup: handleSetup,
  task: handleTask,
  "task-worker": handleTaskWorker,
  "task-resume-candidate": handleTaskResumeCandidate,
  status: handleStatus,
  result: handleResult,
  cancel: handleCancel
};

const [subcommand, ...argv] = process.argv.slice(2);
const handler = handlers[subcommand];
if (!handler) {
  process.stderr.write(`Usage: dotcraft-companion.mjs <${Object.keys(handlers).join("|")}> [options]\n`);
  process.exitCode = 1;
} else {
  try {
    await handler(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
