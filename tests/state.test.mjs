import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { generateJobId, jobFile, jobLogFile, listJobs, resolveStateDir, saveJob } from "../plugins/dotcraft/scripts/lib/state.mjs";
import { makeTempDir } from "./helpers.mjs";

function useStore() {
  const pluginData = makeTempDir();
  process.env.CLAUDE_PLUGIN_DATA = pluginData;
  return { pluginData, workspace: makeTempDir() };
}

test("job ids use the task prefix, base36 time, and a random suffix", () => {
  const id = generateJobId();
  assert.match(id, /^task-[0-9a-z]+-[0-9a-z]+$/);
  assert.notEqual(generateJobId(), id);
});

test("the store lives under CLAUDE_PLUGIN_DATA in a folder named after the workspace", () => {
  const { pluginData, workspace } = useStore();
  const dir = resolveStateDir(workspace);
  assert.equal(path.dirname(dir), path.join(pluginData, "state"));
  assert.match(path.basename(dir), new RegExp(`^${path.basename(workspace)}-[0-9a-f]{16}$`));
});

test("jobs are listed newest first and updates keep their place", () => {
  const { workspace } = useStore();
  saveJob(workspace, { id: "task-a", status: "running" });
  saveJob(workspace, { id: "task-b", status: "running" });
  saveJob(workspace, { id: "task-a", status: "completed", request: { prompt: "secret" }, result: { answer: "x" } });

  const jobs = listJobs(workspace);
  assert.deepEqual(jobs.map((job) => job.id), ["task-b", "task-a"]);
  assert.equal(jobs[1].status, "completed");
  assert.equal(jobs[1].request, undefined);
  assert.equal(JSON.parse(fs.readFileSync(jobFile(workspace, "task-a"), "utf8")).result.answer, "x");
});

test("the store keeps 50 jobs and deletes the files of dropped ones", () => {
  const { workspace } = useStore();
  for (let index = 0; index < 51; index += 1) {
    saveJob(workspace, { id: `task-${index}`, status: "completed" });
    fs.writeFileSync(jobLogFile(workspace, `task-${index}`), "log\n");
  }

  const jobs = listJobs(workspace);
  assert.equal(jobs.length, 50);
  assert.equal(jobs[0].id, "task-50");
  assert.equal(jobs.at(-1).id, "task-1");
  assert.equal(fs.existsSync(jobFile(workspace, "task-0")), false);
  assert.equal(fs.existsSync(jobFile(workspace, "task-1")), true);
  assert.equal(fs.readdirSync(path.dirname(jobFile(workspace, "task-1"))).length, 100);
});

test("a corrupt state.json reads as an empty store", () => {
  const { workspace } = useStore();
  fs.mkdirSync(resolveStateDir(workspace), { recursive: true });
  fs.writeFileSync(path.join(resolveStateDir(workspace), "state.json"), "{ not json");
  assert.deepEqual(listJobs(workspace), []);

  saveJob(workspace, { id: "task-new", status: "queued" });
  assert.deepEqual(listJobs(workspace).map((job) => job.id), ["task-new"]);
});
