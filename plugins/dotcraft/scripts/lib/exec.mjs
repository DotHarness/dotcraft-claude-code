import readline from "node:readline";

import { spawnDotcraft } from "./process.mjs";

export function buildExecArgs({ threadId, model, images = [], autoApprove }) {
  const args = threadId ? ["exec", "resume", threadId, "--json"] : ["exec", "--json"];
  if (model) {
    args.push("-m", model);
  }
  for (const image of images) {
    args.push("-i", image);
  }
  if (autoApprove) {
    args.push("--auto-approve");
  }
  args.push("-");
  return args;
}

function describeItem(item) {
  switch (item.type) {
    case "command_execution":
      return {
        phase: "running",
        message: `Command ${item.status ?? "finished"}${Number.isInteger(item.exit_code) ? ` (exit ${item.exit_code})` : ""}: ${item.command}`
      };
    case "file_change":
      return {
        phase: "editing",
        message: `Changed files: ${(item.changes ?? []).map((change) => `${change.path} (${change.kind})`).join(", ")}`
      };
    case "mcp_tool_call":
      return { phase: "running", message: `Tool ${item.status ?? "finished"}: ${item.server}/${item.tool}` };
    case "web_search":
      return { phase: "running", message: `Searched the web: ${item.query}` };
    case "todo_list": {
      const items = item.items ?? [];
      return { phase: "running", message: `To-do list: ${items.filter((entry) => entry.completed).length}/${items.length} done` };
    }
    case "image_generation":
      return item.saved_path
        ? { phase: "running", message: `Generated image: ${item.saved_path}` }
        : { phase: "running", message: `Image generation ${item.status ?? "finished"}${item.error ? `: ${item.error}` : ""}` };
    default:
      return null;
  }
}

export function runExec(request, { onThread, onProgress, onStderr }) {
  return new Promise((resolve) => {
    const child = spawnDotcraft(buildExecArgs(request), { cwd: request.cwd });
    const run = { threadId: request.threadId ?? null, answer: "", images: [], completed: false, error: null };
    let lastStderrLine = "";

    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      switch (event.type) {
        case "thread.started":
          run.threadId = event.thread_id;
          onThread(event.thread_id);
          onProgress({ phase: "starting", message: `DotCraft thread ${event.thread_id} started.` });
          break;
        case "turn.started":
          onProgress({ phase: "running", message: "Turn started." });
          break;
        case "item.completed": {
          const { item } = event;
          if (item.type === "agent_message") {
            run.answer = item.text ?? "";
          }
          if (item.type === "image_generation" && item.saved_path) {
            run.images.push(item.saved_path);
          }
          const progress = describeItem(item);
          if (progress) {
            onProgress(progress);
          }
          break;
        }
        case "turn.completed":
          run.completed = true;
          break;
        case "turn.failed":
          run.error = event.error?.message ?? "DotCraft turn failed.";
          break;
        case "error":
          run.error = event.message ?? "DotCraft reported an error.";
          break;
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      onStderr(chunk);
      lastStderrLine = chunk.trim().split(/\r?\n/).pop() || lastStderrLine;
    });

    const finish = (code) => {
      const completed = code === 0 && run.completed;
      resolve({
        ...run,
        status: completed ? "completed" : "failed",
        error: completed ? null : run.error || lastStderrLine || `dotcraft exec exited with code ${code}.`
      });
    };
    child.on("error", (error) => {
      run.error ??= error.message;
      finish(null);
    });
    child.on("close", finish);

    child.stdin.on("error", () => {});
    child.stdin.end(request.prompt);
  });
}
