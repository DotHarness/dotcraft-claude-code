export function formatElapsed(job) {
  const start = Date.parse(job.startedAt ?? job.createdAt ?? "");
  const end = job.completedAt ? Date.parse(job.completedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "";
  }
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds >= 3600) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function cell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function renderResult(job) {
  const body = (job.status === "completed" ? job.result?.answer : job.errorMessage) || "DotCraft did not return a final message.";
  const lines = [body.trimEnd(), ""];
  for (const image of job.result?.images ?? []) {
    lines.push(`Generated image: ${image}`);
  }
  if (job.threadId) {
    lines.push(`DotCraft thread: ${job.threadId}`);
  }
  lines.push(`Job: ${job.id}`);
  return `${lines.join("\n")}\n`;
}

function jobSummaryLines(job) {
  const lines = [`- ${job.id} | ${job.kind} | ${job.status} | ${formatElapsed(job)} | ${job.summary ?? ""}`];
  if (job.threadId) {
    lines.push(`  DotCraft thread: ${job.threadId}`);
  }
  if (job.errorMessage) {
    lines.push(`  Error: ${job.errorMessage}`);
  }
  lines.push(`  Result: /dotcraft:result ${job.id}`);
  return lines;
}

export function renderStatus({ active, latestFinished, recent }) {
  const lines = ["# DotCraft Status", ""];
  if (active.length === 0 && !latestFinished) {
    lines.push("No DotCraft jobs recorded yet.");
    return `${lines.join("\n")}\n`;
  }

  if (active.length > 0) {
    lines.push("Active jobs:", "| Job | Kind | Status | Phase | Elapsed | Summary |", "| --- | --- | --- | --- | --- | --- |");
    for (const job of active) {
      lines.push(`| ${cell(job.id)} | ${cell(job.kind)} | ${cell(job.status)} | ${cell(job.phase)} | ${formatElapsed(job)} | ${cell(job.summary)} |`);
    }
    for (const job of active) {
      lines.push("", `${job.id}:`);
      if (job.threadId) {
        lines.push(`  DotCraft thread: ${job.threadId}`);
      }
      for (const line of job.progress) {
        lines.push(`  ${line}`);
      }
      lines.push(`  Cancel: /dotcraft:cancel ${job.id}`);
    }
    lines.push("");
  }

  if (latestFinished) {
    lines.push("Latest finished:", ...jobSummaryLines(latestFinished), "");
  }

  if (recent.length > 0) {
    lines.push("Recent jobs:");
    for (const job of recent) {
      lines.push(...jobSummaryLines(job));
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderJobStatus(job, progress, waitTimedOut = false) {
  const lines = [`# ${job.title} ${job.id}`, "", `Status: ${job.status}`];
  if (job.phase) {
    lines.push(`Phase: ${job.phase}`);
  }
  lines.push(`Kind: ${job.kind}`, `Summary: ${job.summary ?? ""}`, `Elapsed: ${formatElapsed(job)}`);
  if (job.threadId) {
    lines.push(`DotCraft thread: ${job.threadId}`);
  }
  if (job.errorMessage) {
    lines.push(`Error: ${job.errorMessage}`);
  }
  lines.push(`Created: ${job.createdAt}`);
  if (job.startedAt) {
    lines.push(`Started: ${job.startedAt}`);
  }
  if (job.completedAt) {
    lines.push(`Finished: ${job.completedAt}`);
  }
  if (progress.length > 0) {
    lines.push("", "Progress:", ...progress.map((line) => `  ${line}`));
  }
  lines.push("");
  if (job.status === "queued" || job.status === "running") {
    if (waitTimedOut) {
      lines.push("Timed out waiting for the job to finish.");
    }
    lines.push(`Cancel: /dotcraft:cancel ${job.id}`);
  } else {
    lines.push(`Result: /dotcraft:result ${job.id}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderCancel({ job, interrupt }) {
  const lines = [`Cancelled ${job.id}.`];
  if (!interrupt) {
    lines.push("DotCraft had not reported a thread yet, so only the local run was stopped.");
  } else if (interrupt.interrupted) {
    lines.push(`Interrupted the DotCraft turn on thread ${job.threadId}.`);
  } else {
    lines.push(`Could not interrupt DotCraft thread ${job.threadId}: ${interrupt.detail}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderSetup(report) {
  const lines = [
    "# DotCraft Setup",
    "",
    `Status: ${report.ready ? "ready" : "needs attention"}`,
    "",
    `- Node: ${report.node}`,
    `- DotCraft: ${report.dotcraft.available ? `${report.dotcraft.version} (${report.dotcraft.path})` : "not found on PATH"}`,
    `- Workspace: ${report.workspace.hasCraft ? report.workspace.root : `${report.workspace.root} has no .craft folder`}`
  ];
  if (report.nextSteps.length > 0) {
    lines.push("", "Next steps:", ...report.nextSteps.map((step) => `- ${step}`));
  }
  return `${lines.join("\n")}\n`;
}
