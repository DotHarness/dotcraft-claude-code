import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { listJobs, readJob } from "../plugins/dotcraft/scripts/lib/state.mjs";
import {
  buildEnv,
  companion,
  deadPid,
  installFakeDotcraft,
  isAlive,
  kill,
  makeTempDir,
  makeWorkspace,
  readCalls,
  seedJobs,
  startSleeper,
  waitFor
} from "./helpers.mjs";

function setup({ scenario, sessionId = "sess-a" } = {}) {
  const binDir = installFakeDotcraft(scenario);
  const workspace = makeWorkspace();
  const pluginData = makeTempDir();
  process.env.CLAUDE_PLUGIN_DATA = pluginData;
  const env = buildEnv({ binDir, pluginData, sessionId });
  return { binDir, workspace, pluginData, env, envFor: (other) => buildEnv({ binDir, pluginData, sessionId: other }) };
}

const finished = (id, sessionId, extra = {}) => ({ id, sessionId, status: "completed", threadId: `thread_${id}`, ...extra });

test("status without a job id lists only this session's jobs", () => {
  const { workspace, pluginData, env } = setup();
  seedJobs(pluginData, workspace, [
    { id: "task-other-run", sessionId: "sess-b", status: "running", phase: "running" },
    { id: "task-mine-run", sessionId: "sess-a", status: "running", phase: "editing" },
    finished("task-mine-done", "sess-a"),
    finished("task-other-done", "sess-b")
  ]);

  const snapshot = JSON.parse(companion(["status", "--json"], { cwd: workspace, env }).stdout);
  assert.deepEqual(snapshot.active.map((job) => job.id), ["task-mine-run"]);
  assert.equal(snapshot.latestFinished.id, "task-mine-done");
  assert.deepEqual(snapshot.recent, []);

  const other = JSON.parse(companion(["status", "task-other-done", "--json"], { cwd: workspace, env }).stdout);
  assert.equal(other.job.id, "task-other-done");
});

test("status --wait reports a timeout while the job is still active", () => {
  const { workspace, pluginData, env } = setup();
  seedJobs(pluginData, workspace, [{ id: "task-slow", sessionId: "sess-a", status: "running" }]);

  const result = companion(["status", "task-sl", "--wait", "--timeout-ms", "200"], { cwd: workspace, env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Timed out waiting for the job to finish\./);
});

test("result without a job id shows this session's newest finished job", () => {
  const { workspace, pluginData, env, envFor } = setup();
  seedJobs(pluginData, workspace, [
    finished("task-other", "sess-b", { result: { answer: "other answer" } }),
    finished("task-mine", "sess-a", { result: { answer: "my answer", images: [] } })
  ]);

  assert.match(companion(["result"], { cwd: workspace, env }).stdout, /^my answer\n\nDotCraft thread: thread_task-mine\nJob: task-mine\n$/);
  assert.match(companion(["result"], { cwd: workspace, env: envFor("sess-b") }).stdout, /^other answer\n/);
  assert.match(companion(["result"], { cwd: workspace, env: envFor(null) }).stdout, /^other answer\n/);
});

test("result reports a job that is still active", () => {
  const { workspace, pluginData, env } = setup();
  seedJobs(pluginData, workspace, [{ id: "task-live", sessionId: "sess-a", status: "running" }]);

  const result = companion(["result", "task-live"], { cwd: workspace, env });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "Job task-live is still running. Check /dotcraft:status and try again once it finishes.\n");
});

test("--resume-last continues this session's newest finished task thread", () => {
  const { binDir, workspace, pluginData, env } = setup();
  seedJobs(pluginData, workspace, [
    finished("task-other", "sess-b"),
    finished("task-image", "sess-a", { kind: "image" }),
    finished("task-mine", "sess-a")
  ]);

  const result = companion(["task", "--resume", "--model", "gpt-6.1-sol"], { cwd: workspace, env });
  assert.equal(result.status, 0, result.stderr);
  const [call] = readCalls(binDir);
  assert.deepEqual(call.args, ["exec", "resume", "thread_task-mine", "--json", "-m", "gpt-6.1-sol", "-"]);
  assert.equal(call.stdin, "Continue the previous task.");
  assert.equal(listJobs(workspace)[0].title, "DotCraft Resume");
});

test("--resume-last refuses while a task of this session is active, and without a thread", () => {
  const { workspace, pluginData, env, envFor } = setup();
  seedJobs(pluginData, workspace, [{ id: "task-live", sessionId: "sess-a", status: "running" }, finished("task-old", "sess-a")]);

  const busy = companion(["task", "--resume-last", "go on"], { cwd: workspace, env });
  assert.equal(busy.status, 1);
  assert.equal(busy.stderr, "Task task-live is still running. Use /dotcraft:status before continuing it.\n");

  const none = companion(["task", "--resume-last", "go on"], { cwd: workspace, env: envFor("sess-new") });
  assert.equal(none.status, 1);
  assert.equal(none.stderr, "No previous DotCraft task thread was found for this session.\n");

  const both = companion(["task", "--resume-last", "--fresh", "go on"], { cwd: workspace, env });
  assert.equal(both.status, 1);
});

test("task-resume-candidate reports this session's resumable thread", () => {
  const { workspace, pluginData, env, envFor } = setup();
  seedJobs(pluginData, workspace, [finished("task-mine", "sess-a", { completedAt: "2026-10-18T10:00:00.000Z" })]);

  const mine = JSON.parse(companion(["task-resume-candidate", "--json"], { cwd: workspace, env }).stdout);
  assert.equal(mine.available, true);
  assert.equal(mine.sessionId, "sess-a");
  assert.deepEqual(mine.candidate, {
    id: "task-mine",
    status: "completed",
    title: "DotCraft Task",
    summary: "task-mine",
    threadId: "thread_task-mine",
    completedAt: "2026-10-18T10:00:00.000Z"
  });

  const other = JSON.parse(companion(["task-resume-candidate", "--json"], { cwd: workspace, env: envFor("sess-b") }).stdout);
  assert.deepEqual(other, { available: false, sessionId: "sess-b", candidate: null });
});

test("task --background runs in a worker and its result is readable once it finishes", () => {
  const { workspace, env } = setup();
  const launched = companion(["task", "--background", "Summarize the repo"], { cwd: workspace, env });

  assert.equal(launched.status, 0, launched.stderr);
  const jobId = launched.stdout.match(/as (task-[0-9a-z-]+)\./)[1];
  assert.equal(launched.stdout, `DotCraft Task started in the background as ${jobId}. Check /dotcraft:status ${jobId} for progress.\n`);

  const waited = JSON.parse(companion(["status", jobId, "--wait", "--timeout-ms", "15000", "--json"], { cwd: workspace, env }).stdout);
  assert.equal(waited.job.status, "completed");
  assert.equal(waited.job.threadId, "thread_fake_1");
  assert.equal(waited.waitTimedOut, false);

  assert.equal(
    companion(["result", jobId], { cwd: workspace, env }).stdout,
    `Handled: Summarize the repo\n\nDotCraft thread: thread_fake_1\nJob: ${jobId}\n`
  );
});

test("cancel interrupts the recorded thread before terminating the process tree", async (t) => {
  const { binDir, workspace, pluginData, env } = setup();
  const pid = startSleeper();
  t.after(() => kill(pid));
  seedJobs(pluginData, workspace, [{ id: "task-live", sessionId: "sess-a", status: "running", pid, threadId: "thread_live" }]);

  const result = companion(["cancel"], { cwd: workspace, env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Cancelled task-live.\nInterrupted the DotCraft turn on thread thread_live.\n");
  assert.deepEqual(readCalls(binDir).map((call) => call.args), [["exec", "interrupt", "thread_live"]]);
  await waitFor(() => !isAlive(pid));

  const job = readJob(workspace, "task-live");
  assert.equal(job.status, "cancelled");
  assert.equal(job.errorMessage, "Cancelled by user.");
  assert.equal(job.pid, null);
});

test("cancel still interrupts the thread when the job's process is already gone", () => {
  const { binDir, workspace, pluginData, env } = setup({ scenario: { interrupt: { stderr: "Thread not found.", exitCode: 1 } } });
  seedJobs(pluginData, workspace, [{ id: "task-orphan", sessionId: "sess-a", status: "running", pid: deadPid(), threadId: "thread_gone" }]);

  const result = companion(["cancel", "task-orphan", "--json"], { cwd: workspace, env });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    jobId: "task-orphan",
    status: "cancelled",
    threadId: "thread_gone",
    interrupt: { interrupted: false, detail: "Thread not found." }
  });
  assert.deepEqual(readCalls(binDir)[0].args, ["exec", "interrupt", "thread_gone"]);
});

test("cancel without a job id considers only this session's active jobs", async (t) => {
  const { binDir, workspace, pluginData, env, envFor } = setup();
  const pid = startSleeper();
  t.after(() => kill(pid));
  seedJobs(pluginData, workspace, [
    { id: "task-b1", sessionId: "sess-b", status: "running", pid, threadId: "thread_b1" },
    { id: "task-b2", sessionId: "sess-b", status: "queued", pid: null }
  ]);

  const none = companion(["cancel"], { cwd: workspace, env });
  assert.equal(none.stderr, "No active DotCraft job to cancel.\n");
  const several = companion(["cancel"], { cwd: workspace, env: envFor("sess-b") });
  assert.equal(several.stderr, "Multiple DotCraft jobs are active. Pass a job id to /dotcraft:cancel.\n");
  assert.deepEqual(readCalls(binDir), []);
  assert.equal(isAlive(pid), true);

  const byId = companion(["cancel", "task-b1"], { cwd: workspace, env });
  assert.equal(byId.status, 0, byId.stderr);
  await waitFor(() => !isAlive(pid));
});

test("cancel stops a real background run and records it as cancelled", async () => {
  const { binDir, workspace, env } = setup({ scenario: { hang: true, events: [{ type: "thread.started", thread_id: "thread_hang" }] } });
  const launched = companion(["task", "--background", "Run forever"], { cwd: workspace, env });
  const jobId = launched.stdout.match(/as (task-[0-9a-z-]+)\./)[1];
  await waitFor(() => readJob(workspace, jobId)?.threadId === "thread_hang");
  const execPid = Number(await waitFor(() => fs.existsSync(path.join(binDir, "exec.pid")) && fs.readFileSync(path.join(binDir, "exec.pid"), "utf8")));
  const workerPid = readJob(workspace, jobId).pid;

  const result = companion(["cancel", jobId], { cwd: workspace, env });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readCalls(binDir).at(-1).args, ["exec", "interrupt", "thread_hang"]);
  await waitFor(() => !isAlive(execPid) && !isAlive(workerPid));
  assert.equal(readJob(workspace, jobId).status, "cancelled");
});

test("setup reports ready with dotcraft on PATH and a workspace", () => {
  const { workspace, env } = setup({ scenario: { version: "0.8.10+abc" } });
  const report = JSON.parse(companion(["setup", "--json", "--cwd", workspace], { cwd: workspace, env }).stdout);

  assert.equal(report.ready, true);
  assert.equal(report.node, process.version);
  assert.equal(report.dotcraft.available, true);
  assert.equal(report.dotcraft.version, "0.8.10+abc");
  assert.match(report.dotcraft.path, /dotcraft(\.cmd)?$/);
  assert.deepEqual(report.workspace, { root: workspace, hasCraft: true });
  assert.deepEqual(report.nextSteps, []);
});

test("setup reports a project without .craft", () => {
  const { env } = setup();
  const folder = makeTempDir();
  const report = JSON.parse(companion(["setup", "--json"], { cwd: folder, env }).stdout);

  assert.equal(report.ready, false);
  assert.equal(report.workspace.hasCraft, false);
  assert.deepEqual(report.nextSteps, [`Open ${folder} in DotCraft Desktop, or run \`dotcraft setup\` in it.`]);
});

test("setup finds the Desktop bundled binary when dotcraft is not on PATH", { skip: process.platform !== "win32" }, () => {
  const workspace = makeWorkspace();
  const localAppData = makeTempDir();
  const binDir = path.join(localAppData, "Programs", "DotCraft", "resources", "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, "dotcraft.exe"), "");
  const pathValue = [path.dirname(process.execPath), path.join(process.env.SystemRoot, "System32")].join(path.delimiter);
  const env = buildEnv({ pluginData: makeTempDir(), pathValue, extra: { LOCALAPPDATA: localAppData } });

  const report = JSON.parse(companion(["setup", "--json"], { cwd: workspace, env }).stdout);
  assert.equal(report.ready, false);
  assert.equal(report.dotcraft.available, false);
  assert.equal(report.dotcraft.bundledPath, path.join(binDir, "dotcraft.exe"));
  assert.deepEqual(report.nextSteps, [`Add ${binDir} to your PATH, then restart Claude Code.`]);

  fs.rmSync(path.join(binDir, "dotcraft.exe"));
  const missing = JSON.parse(companion(["setup", "--json"], { cwd: workspace, env }).stdout);
  assert.equal(missing.dotcraft.bundledPath, null);
  assert.deepEqual(missing.nextSteps, ["Install DotCraft: https://github.com/DotHarness/dotcraft"]);
});
