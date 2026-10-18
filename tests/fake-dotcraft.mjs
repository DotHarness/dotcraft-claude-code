import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [binDir, ...args] = process.argv.slice(2);
const scenarioFile = path.join(binDir, "scenario.json");
const scenario = fs.existsSync(scenarioFile) ? JSON.parse(fs.readFileSync(scenarioFile, "utf8")) : {};

function record(stdin) {
  fs.appendFileSync(path.join(binDir, "calls.jsonl"), `${JSON.stringify({ args, cwd: process.cwd(), stdin })}\n`);
}

if (args[0] === "--version") {
  record(null);
  process.stdout.write(`${scenario.version ?? "0.8.10"}\n`);
} else if (args[0] === "exec" && args[1] === "interrupt") {
  record(null);
  const interrupt = scenario.interrupt ?? {};
  process.stderr.write(`${interrupt.stderr ?? `[CLI] Interrupted turn turn_1 on thread ${args[2]}.`}\n`);
  process.exitCode = interrupt.exitCode ?? 0;
} else if (args[0] === "exec") {
  const stdin = fs.readFileSync(0, "utf8");
  record(stdin);
  if (!fs.existsSync(path.join(process.cwd(), ".craft"))) {
    process.stderr.write(`DotCraft workspace not found: ${path.join(process.cwd(), ".craft")}\n`);
    process.exit(1);
  }
  const threadId = args[1] === "resume" ? args[2] : (scenario.threadId ?? "thread_fake_1");
  const events = scenario.events ?? [
    { type: "thread.started", thread_id: threadId },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "item_1", type: "agent_message", text: `Handled: ${stdin.trim()}` } },
    { type: "turn.completed", usage: {} }
  ];
  for (const event of events) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
  for (const line of scenario.stderr ?? [`[CLI] Thread: ${threadId}`]) {
    process.stderr.write(`${line}\n`);
  }
  if (scenario.hang) {
    fs.writeFileSync(path.join(binDir, "exec.pid"), String(process.pid));
    setInterval(() => {}, 1000);
  } else {
    process.exitCode = scenario.exitCode ?? 0;
  }
} else {
  record(null);
  process.stderr.write(`Unexpected arguments: ${args.join(" ")}\n`);
  process.exitCode = 2;
}
