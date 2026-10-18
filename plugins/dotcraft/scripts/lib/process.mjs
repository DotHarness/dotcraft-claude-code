import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";

function quoteForCmd(arg) {
  return /^[\w\-.:\\/=,@+]+$/.test(arg) ? arg : `"${arg}"`;
}

export function spawnDotcraft(args, options = {}) {
  const spawnOptions = {
    cwd: options.cwd,
    env: process.env,
    stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
    windowsHide: true
  };
  if (isWindows) {
    return spawn(["dotcraft", ...args.map(quoteForCmd)].join(" "), { ...spawnOptions, shell: true });
  }
  return spawn("dotcraft", args, spawnOptions);
}

export function runDotcraft(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawnDotcraft(args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ status: 1, stdout, stderr: `${stderr}${error.message}\n` }));
    child.on("close", (code) => resolve({ status: code ?? 1, stdout, stderr }));
  });
}

export function terminateProcessTree(pid) {
  if (!Number.isInteger(pid)) {
    return;
  }
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, "SIGTERM");
      return;
    } catch (error) {
      if (error.code !== "ESRCH") {
        throw error;
      }
    }
  }
}
