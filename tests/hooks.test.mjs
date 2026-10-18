import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { jobFile, jobLogFile, listJobs } from "../plugins/dotcraft/scripts/lib/state.mjs";
import {
  buildEnv,
  installFakeDotcraft,
  isAlive,
  kill,
  makeTempDir,
  makeWorkspace,
  readCalls,
  runHook,
  seedJobs,
  startSleeper,
  waitFor
} from "./helpers.mjs";

test("SessionStart writes the session id and plugin data folder to the environment file", () => {
  const pluginData = makeTempDir();
  const envFile = path.join(makeTempDir(), "env.sh");
  const env = buildEnv({ pluginData, extra: { CLAUDE_ENV_FILE: envFile } });

  const result = runHook("SessionStart", { hook_event_name: "SessionStart", session_id: "sess-'a'" }, env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(envFile, "utf8"),
    `export DOTCRAFT_COMPANION_SESSION_ID='sess-'"'"'a'"'"''\nexport CLAUDE_PLUGIN_DATA='${pluginData}'\n`
  );
});

test("SessionEnd stops and removes only the ending session's jobs", async (t) => {
  const binDir = installFakeDotcraft();
  const workspace = makeWorkspace();
  const pluginData = makeTempDir();
  const pid = startSleeper();
  const otherPid = startSleeper();
  t.after(() => {
    kill(pid);
    kill(otherPid);
  });
  seedJobs(pluginData, workspace, [
    { id: "task-live", sessionId: "sess-end", status: "running", pid, threadId: "thread_live" },
    { id: "task-done", sessionId: "sess-end", status: "completed", threadId: "thread_done" },
    { id: "task-other", sessionId: "sess-keep", status: "running", pid: otherPid, threadId: "thread_other" }
  ]);
  for (const id of ["task-live", "task-done", "task-other"]) {
    fs.writeFileSync(jobLogFile(workspace, id), "log\n");
  }

  const env = buildEnv({ binDir, pluginData });
  const result = runHook("SessionEnd", { hook_event_name: "SessionEnd", session_id: "sess-end", cwd: workspace }, env);
  assert.equal(result.status, 0, result.stderr);

  assert.deepEqual(readCalls(binDir).map((call) => call.args), [["exec", "interrupt", "thread_live"]]);
  await waitFor(() => !isAlive(pid));
  assert.equal(isAlive(otherPid), true);
  assert.deepEqual(listJobs(workspace).map((job) => job.id), ["task-other"]);
  assert.equal(fs.existsSync(jobFile(workspace, "task-live")), false);
  assert.equal(fs.existsSync(jobLogFile(workspace, "task-done")), false);
  assert.equal(fs.existsSync(jobLogFile(workspace, "task-other")), true);
});
