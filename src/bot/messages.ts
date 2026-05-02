import { DeployedWorkflow } from "../workflows/types";

export const Messages = {
  welcome(): string {
    return `👋 Welcome to Rigel!

I help you deploy and manage KeeperHub workflow JSON files.

Use /jsonup to upload a workflow, or /help to see management commands.`;
  },

  help(): string {
    return `*Workflow Management:*
/jsonup — deploy a workflow from a KeeperHub JSON file
/list — see your workflows
/pause — pause a workflow
/resume — resume a workflow
/run — manually trigger a workflow
/export — download workflow JSON
/delete — delete a workflow
/status — see recent executions
/cancel — cancel current action`;
  },

  deploying(): string {
    return `⟳ Creating your workflow on KeeperHub...`;
  },

  deploySuccess(name: string, url: string): string {
    return `✅ *${name}* is live!
🔗 ${url}
⚡ Active and monitoring now`;
  },

  deployError(error: string): string {
    return `⚠️ Something went wrong creating your workflow.
Error: ${error}

Please try again or visit keeperhub.com`;
  },

  noWorkflows(): string {
    return `KeeperHub returned no workflows for this API key.

If you can see workflows in the app, check that KEEPERHUB_API_KEY belongs to the same org and that KEEPERHUB_PROJECT_ID is not filtering them out.`;
  },

  workflowList(workflows: DeployedWorkflow[]): string {
    const items = workflows
      .map(
        (w, i) =>
          `${i + 1}. ${w.paused ? "⏸" : "⚡"} ${w.name}\n   ${w.url}`
      )
      .join("\n\n");
    return `Your workflows:\n\n${items}`;
  },

  // ─── Stage 4: Workflow management ───────────────────────────────────────────

  selectWorkflow(workflows: DeployedWorkflow[], action: string): string {
    const items = workflows
      .map(
        (w, i) =>
          `${i + 1}. ${w.paused ? "⏸" : "⚡"} *${w.name}*\n   ${w.url}`
      )
      .join("\n\n");
    return (
      `Which workflow would you like to ${action}?\n\n` +
      `${items}\n\n` +
      `Reply with a number (1–${workflows.length}) or /cancel to go back`
    );
  },

  pauseSuccess(name: string): string {
    return `⏸ Paused: *${name}*\n\nSend /resume to re-activate it.`;
  },

  resumeSuccess(name: string): string {
    return `▶️ Resumed: *${name}*\n\nIt's now actively monitoring.`;
  },

  runSuccess(
    name: string,
    result: import("../keeperhub/client").WorkflowExecutionResult
  ): string {
    const ids = [
      result.executionId ? `Execution: \`${result.executionId}\`` : null,
      result.runId ? `Run: \`${result.runId}\`` : null,
      result.status ? `Status: \`${result.status}\`` : null,
    ].filter(Boolean);

    return `▶️ Triggered: *${name}*${ids.length ? `\n\n${ids.join("\n")}` : ""}`;
  },

  deleteConfirm(name: string): string {
    return (
      `⚠️ Are you sure you want to delete *${name}*?\n\n` +
      `This cannot be undone.\n\n` +
      `Reply *yes* to confirm or /cancel to go back`
    );
  },

  deleteSuccess(name: string): string {
    return `🗑 Deleted: *${name}*`;
  },

  statusMessage(name: string, executions: import("../keeperhub/client").Execution[]): string {
    if (executions.length === 0) {
      return `📊 *${name}*\n\nNo executions yet — the workflow hasn't run.`;
    }
    const rows = executions.map((e) => {
      const icon =
        e.status === "success"
          ? "✅"
          : e.status === "failed"
          ? "❌"
          : e.status === "running"
          ? "⟳"
          : "⏳";
      const ts = new Date(e.startedAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });
      return `${icon} ${ts} UTC — ${e.status}`;
    });
    return `📊 *${name}*\n\nLast ${executions.length} executions:\n\n${rows.join("\n")}`;
  },

  // ─── /jsonup ────────────────────────────────────────────────────────────────

  jsonupPrompt(): string {
    return (
      `📤 *Deploy from JSON*\n\n` +
      `Upload your KeeperHub workflow JSON file and I'll deploy it instantly.\n\n` +
      '_Send the `.json` file now, or /cancel to go back._'
    );
  },

  jsonupInvalidFile(): string {
    return (
      `❌ That doesn't look like a valid KeeperHub workflow JSON.\n\n` +
      'The file must contain at minimum a `name` field plus `nodes` and `edges` arrays.\n\n' +
      `Please try again or /cancel to go back.`
    );
  },

  jsonupParseError(detail: string): string {
    return (
      `❌ Failed to parse JSON file: ${detail}\n\n` +
      `Make sure the file is valid JSON and try again, or /cancel to go back.`
    );
  },

  jsonupDeploying(name: string): string {
    return `⟳ Deploying *${name}* from JSON…`;
  },
};
