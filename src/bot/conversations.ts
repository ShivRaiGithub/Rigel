import { Context, InputFile } from "grammy";
import { Messages } from "./messages";
import {
  getSession,
  updateSession,
  removeWorkflow,
  updateWorkflowPaused,
} from "../store/userStore";
import {
  pauseWorkflow,
  resumeWorkflow,
  deleteWorkflow,
  getExecutionHistory,
  getWorkflow,
  triggerWorkflow,
} from "../keeperhub/client";

function parseSelection(text: string): number | null {
  const n = parseInt(text.trim(), 10);
  return isNaN(n) ? null : n;
}

function clearManagementState(userId: number): void {
  updateSession(userId, {
    state: "IDLE",
    pendingAction: null,
    pendingDeleteWorkflow: null,
  });
}

function jsonFileName(name: string, workflowId: string): string {
  const safeName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safeName || workflowId}.json`;
}

export async function handleMessage(
  ctx: Context,
  userId: number,
  messageText: string
): Promise<void> {
  const session = getSession(userId);

  if (session.state === "DEPLOYING") {
    await ctx.reply("Working on it, please wait...");
    return;
  }

  if (session.state === "CONFIRMING_DELETE") {
    const resp = messageText.toLowerCase().trim();
    const wf = session.pendingDeleteWorkflow;

    if (!wf) {
      clearManagementState(userId);
      await ctx.reply("Something went wrong. Please try /delete again.");
      return;
    }

    if (resp === "yes") {
      const result = await deleteWorkflow(wf.id);
      clearManagementState(userId);
      if (result.success) {
        removeWorkflow(userId, wf.id);
        await ctx.reply(Messages.deleteSuccess(wf.name), { parse_mode: "Markdown" });
      } else {
        await ctx.reply(`Could not delete. Try again.\n\nError: ${result.error ?? "unknown"}`);
      }
    } else {
      clearManagementState(userId);
      await ctx.reply("Cancelled deletion.");
    }
    return;
  }

  if (session.state === "SELECTING_PAUSE") {
    const activeWfs = session.deployedWorkflows.filter((w) => !w.paused);
    const choice = parseSelection(messageText);
    if (choice === null) {
      await ctx.reply("Please reply with a number from the list, or /cancel");
      return;
    }
    if (choice < 1 || choice > activeWfs.length) {
      await ctx.reply(`Please pick a number between 1 and ${activeWfs.length}`);
      return;
    }

    const wf = activeWfs[choice - 1];
    const result = await pauseWorkflow(wf.id);
    clearManagementState(userId);
    if (result.success) {
      updateWorkflowPaused(userId, wf.id, true);
      await ctx.reply(Messages.pauseSuccess(wf.name), { parse_mode: "Markdown" });
    } else {
      await ctx.reply(`Could not pause workflow. Try again.\n\nError: ${result.error ?? "unknown"}`);
    }
    return;
  }

  if (session.state === "SELECTING_RESUME") {
    const pausedWfs = session.deployedWorkflows.filter((w) => w.paused);
    const choice = parseSelection(messageText);
    if (choice === null) {
      await ctx.reply("Please reply with a number from the list, or /cancel");
      return;
    }
    if (choice < 1 || choice > pausedWfs.length) {
      await ctx.reply(`Please pick a number between 1 and ${pausedWfs.length}`);
      return;
    }

    const wf = pausedWfs[choice - 1];
    const result = await resumeWorkflow(wf.id);
    clearManagementState(userId);
    if (result.success) {
      updateWorkflowPaused(userId, wf.id, false);
      await ctx.reply(Messages.resumeSuccess(wf.name), { parse_mode: "Markdown" });
    } else {
      await ctx.reply(`Could not resume workflow. Try again.\n\nError: ${result.error ?? "unknown"}`);
    }
    return;
  }

  if (session.state === "SELECTING_DELETE") {
    const allWfs = session.deployedWorkflows;
    const choice = parseSelection(messageText);
    if (choice === null) {
      await ctx.reply("Please reply with a number from the list, or /cancel");
      return;
    }
    if (choice < 1 || choice > allWfs.length) {
      await ctx.reply(`Please pick a number between 1 and ${allWfs.length}`);
      return;
    }

    const wf = allWfs[choice - 1];
    updateSession(userId, {
      state: "CONFIRMING_DELETE",
      pendingDeleteWorkflow: wf,
    });
    await ctx.reply(Messages.deleteConfirm(wf.name), { parse_mode: "Markdown" });
    return;
  }

  if (session.state === "SELECTING_STATUS") {
    const allWfs = session.deployedWorkflows;
    const choice = parseSelection(messageText);
    if (choice === null) {
      await ctx.reply("Please reply with a number from the list, or /cancel");
      return;
    }
    if (choice < 1 || choice > allWfs.length) {
      await ctx.reply(`Please pick a number between 1 and ${allWfs.length}`);
      return;
    }

    const wf = allWfs[choice - 1];
    const executions = await getExecutionHistory(wf.id, 5);
    clearManagementState(userId);
    await ctx.reply(Messages.statusMessage(wf.name, executions), {
      parse_mode: "Markdown",
    });
    return;
  }

  if (session.state === "SELECTING_RUN") {
    const allWfs = session.deployedWorkflows;
    const choice = parseSelection(messageText);
    if (choice === null) {
      await ctx.reply("Please reply with a number from the list, or /cancel");
      return;
    }
    if (choice < 1 || choice > allWfs.length) {
      await ctx.reply(`Please pick a number between 1 and ${allWfs.length}`);
      return;
    }

    const wf = allWfs[choice - 1];
    const result = await triggerWorkflow(wf.id);
    clearManagementState(userId);
    if (result.success) {
      await ctx.reply(Messages.runSuccess(wf.name, result), {
        parse_mode: "Markdown",
      });
    } else {
      await ctx.reply(`Could not run workflow. Try again.\n\nError: ${result.error ?? "unknown"}`);
    }
    return;
  }

  if (session.state === "SELECTING_EXPORT") {
    const allWfs = session.deployedWorkflows;
    const choice = parseSelection(messageText);
    if (choice === null) {
      await ctx.reply("Please reply with a number from the list, or /cancel");
      return;
    }
    if (choice < 1 || choice > allWfs.length) {
      await ctx.reply(`Please pick a number between 1 and ${allWfs.length}`);
      return;
    }

    const wf = allWfs[choice - 1];
    try {
      const workflow = await getWorkflow(wf.id);
      const json = JSON.stringify(workflow, null, 2);
      clearManagementState(userId);
      await ctx.replyWithDocument(
        new InputFile(Buffer.from(json, "utf8"), jsonFileName(wf.name, wf.id)),
        { caption: `Exported ${wf.name}` }
      );
    } catch (err) {
      clearManagementState(userId);
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Could not export workflow. Try again.\n\nError: ${message}`);
    }
    return;
  }

  await ctx.reply("Use /jsonup to upload a workflow JSON, or /help to see management commands.");
}
