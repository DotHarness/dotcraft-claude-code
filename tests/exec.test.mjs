import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildExecArgs } from "../plugins/dotcraft/scripts/lib/exec.mjs";
import { buildEnv, companion, installFakeDotcraft, makeTempDir, makeWorkspace, readCalls } from "./helpers.mjs";

function setup(scenario) {
  const binDir = installFakeDotcraft(scenario);
  const workspace = makeWorkspace();
  const env = buildEnv({ binDir, pluginData: makeTempDir() });
  return { binDir, workspace, env };
}

test("exec arguments cover new, resumed, model, image, and auto-approve runs", () => {
  assert.deepEqual(buildExecArgs({}), ["exec", "--json", "-"]);
  assert.deepEqual(buildExecArgs({ threadId: "thread_1" }), ["exec", "resume", "thread_1", "--json", "-"]);
  assert.deepEqual(buildExecArgs({ threadId: "thread_1", model: "gpt-6.1-sol", images: ["/a.png", "/b c.png"], autoApprove: true }), [
    "exec",
    "resume",
    "thread_1",
    "--json",
    "-m",
    "gpt-6.1-sol",
    "-i",
    "/a.png",
    "-i",
    "/b c.png",
    "--auto-approve",
    "-"
  ]);
});

test("task sends the prompt on stdin with the requested options and runs in the workspace", () => {
  const { binDir, workspace, env } = setup();
  fs.mkdirSync(path.join(workspace, "refs dir"));
  const result = companion(
    ["task", "--cwd", workspace, "--model", "gpt-6.1-sol", "--image", "refs dir/one.png", "--image", "two.png", "--auto-approve"],
    { cwd: workspace, env, input: "Fix the \"flaky\" test & report\n" }
  );

  assert.equal(result.status, 0, result.stderr);
  const [call] = readCalls(binDir);
  assert.deepEqual(call.args, [
    "exec",
    "--json",
    "-m",
    "gpt-6.1-sol",
    "-i",
    path.join(workspace, "refs dir", "one.png"),
    "-i",
    path.join(workspace, "two.png"),
    "--auto-approve",
    "-"
  ]);
  assert.equal(call.stdin, 'Fix the "flaky" test & report');
  assert.equal(path.resolve(call.cwd), workspace);
  assert.match(result.stderr, /\[dotcraft\] DotCraft thread thread_fake_1 started\./);
});

test("a completed run prints the answer, generated images, thread, and job", () => {
  const { workspace, env } = setup({
    events: [
      { type: "thread.started", thread_id: "thread_img" },
      { type: "turn.started" },
      { type: "item.completed", item: { id: "1", type: "agent_message", text: "Working on it." } },
      { type: "item.completed", item: { id: "2", type: "image_generation", status: "completed", saved_path: "/w/.craft/a.png" } },
      { type: "item.completed", item: { id: "3", type: "image_generation", status: "completed", saved_path: "/w/.craft/b.png" } },
      { type: "item.completed", item: { id: "4", type: "agent_message", text: "Here are two robots." } },
      { type: "turn.completed", usage: {} }
    ]
  });
  const result = companion(["task", "--kind", "image", "Draw a robot"], { cwd: workspace, env });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /^Here are two robots\.\n\nGenerated image: \/w\/\.craft\/a\.png\nGenerated image: \/w\/\.craft\/b\.png\nDotCraft thread: thread_img\nJob: task-[0-9a-z-]+\n$/
  );

  const json = JSON.parse(companion(["result", "--json"], { cwd: workspace, env }).stdout);
  assert.equal(json.kind, "image");
  assert.equal(json.title, "DotCraft Image");
  assert.equal(json.status, "completed");
  assert.deepEqual(json.result, { answer: "Here are two robots.", images: ["/w/.craft/a.png", "/w/.craft/b.png"], threadId: "thread_img" });
});

test("turn.failed maps to a failed job with its message", () => {
  const { workspace, env } = setup({
    events: [{ type: "thread.started", thread_id: "thread_f" }, { type: "turn.failed", error: { message: "Model not found: x" } }],
    exitCode: 1
  });
  const result = companion(["task", "go"], { cwd: workspace, env });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^Model not found: x\n\nDotCraft thread: thread_f\nJob: /);
  const job = JSON.parse(companion(["result", "--json"], { cwd: workspace, env }).stdout);
  assert.equal(job.status, "failed");
  assert.equal(job.errorMessage, "Model not found: x");
});

test("an error event maps to a failed job with its message", () => {
  const { workspace, env } = setup({ events: [{ type: "error", message: "No provider is configured." }], stderr: [], exitCode: 1 });
  const result = companion(["task", "go"], { cwd: workspace, env });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^No provider is configured\.\n\nJob: /);
});

test("a run without a terminal event fails with the last stderr line", () => {
  const binDir = installFakeDotcraft();
  const workspace = makeTempDir();
  const env = buildEnv({ binDir, pluginData: makeTempDir() });
  const result = companion(["task", "go"], { cwd: workspace, env });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^DotCraft workspace not found: .*\.craft\n\nJob: /);
});

test("exit 0 without turn.completed is a failure", () => {
  const { workspace, env } = setup({ events: [{ type: "thread.started", thread_id: "thread_x" }], stderr: ["Turn cancelled."] });
  const result = companion(["task", "go"], { cwd: workspace, env });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^Turn cancelled\.\n/);
});
