import { Context, InputFile } from "grammy";
import { Messages } from "./messages";
import { parseIntent } from "../llm/intentParser";
import {
  getSession,
  updateSession,
  resetSession,
  addWorkflow,
  removeWorkflow,
  updateWorkflowPaused,
} from "../store/userStore";
import { DeployedWorkflow, ParsedIntent } from "../workflows/types";
import { MAX_CLARIFYING_ATTEMPTS } from "../constants";
import {
  createWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  deleteWorkflow,
  getExecutionHistory,
  getWorkflow,
  triggerWorkflow,
} from "../keeperhub/client";
import { buildWorkflow, workflowMeta } from "../workflows/builder";

// workflowName is now handled by workflowMeta() in the builder module

// ─── Real KeeperHub deployment ────────────────────────────────────────────────

/**
 * Builds a KeeperHub workflow from the parsed intent and deploys it via the
 * KeeperHub REST API (create + patch two-step pattern).
 */
async function deployWorkflow(ctx: Context, userId: number): Promise<void> {
  const session = getSession(userId);
  const intent = session.currentIntent!;

  const { name, description } = workflowMeta(intent);

  let graph;
  try {
    graph = buildWorkflow(intent, String(ctx.chat?.id ?? userId));
  } catch (buildErr) {
    const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
    resetSession(userId);
    await ctx.reply(`❌ Failed to build workflow: ${msg}`);
    return;
  }

  const result = await createWorkflow(name, description, graph);

  if (!result.success || !result.workflowId || !result.workflowUrl) {
    resetSession(userId);
    await ctx.reply(
      `❌ KeeperHub deployment failed: ${result.error ?? "unknown error"}\n\nPlease try again or check your API key.`
    );
    return;
  }

  const deployed: DeployedWorkflow = {
    id: result.workflowId,
    name,
    type: intent.workflowType,
    url: result.workflowUrl,
    createdAt: Date.now(),
    paused: false,
  };

  addWorkflow(userId, deployed);
  resetSession(userId);

  console.log(`[deploy] Live on KeeperHub: "${name}" (${result.workflowId}) for user ${userId}`);

  await ctx.reply(Messages.deploySuccess(name, result.workflowUrl), {
    parse_mode: "Markdown",
  });
}

// ─── Core state machine ───────────────────────────────────────────────────────

/** Shared helper: parse a 1-based numeric choice from user text. */
function parseSelection(text: string): number | null {
  const n = parseInt(text.trim(), 10);
  return isNaN(n) ? null : n;
}

/** Reset to IDLE and clear Stage 4 management fields. */
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

/**
 * Routes an incoming text message through the conversation state machine.
 * States: IDLE → PARSING → CLARIFYING → CONFIRMING → DEPLOYING
 *         SELECTING_PAUSE / SELECTING_RESUME / SELECTING_DELETE / SELECTING_STATUS
 *         CONFIRMING_DELETE
 */
export async function handleMessage(
  ctx: Context,
  userId: number,
  messageText: string
): Promise<void> {
  const session = getSession(userId);

  // ── DEPLOYING ──────────────────────────────────────────────────────────────
  if (session.state === "DEPLOYING") {
    await ctx.reply("⏳ Working on it, please wait...");
    return;
  }

  // ── CONFIRMING_DELETE ──────────────────────────────────────────────────────
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
        await ctx.reply(`⚠️ Could not delete. Try again.\n\nError: ${result.error ?? "unknown"}`);
      }
    } else {
      clearManagementState(userId);
      await ctx.reply("Cancelled deletion.");
    }
    return;
  }

  // ── SELECTING_PAUSE ────────────────────────────────────────────────────────
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
      await ctx.reply(`⚠️ Could not pause workflow. Try again.\n\nError: ${result.error ?? "unknown"}`);
    }
    return;
  }

  // ── SELECTING_RESUME ───────────────────────────────────────────────────────
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
      await ctx.reply(`⚠️ Could not resume workflow. Try again.\n\nError: ${result.error ?? "unknown"}`);
    }
    return;
  }

  // ── SELECTING_DELETE ───────────────────────────────────────────────────────
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

  // ── SELECTING_STATUS ───────────────────────────────────────────────────────
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

  // ── SELECTING_RUN ──────────────────────────────────────────────────────────
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
      await ctx.reply(`⚠️ Could not run workflow. Try again.\n\nError: ${result.error ?? "unknown"}`);
    }
    return;
  }

  // ── SELECTING_EXPORT ───────────────────────────────────────────────────────
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
      await ctx.reply(`⚠️ Could not export workflow. Try again.\n\nError: ${message}`);
    }
    return;
  }

  // ── CONFIRMING ─────────────────────────────────────────────────────────────
  if (session.state === "CONFIRMING") {
    const response = messageText.toLowerCase().trim();

    if (["yes", "y", "deploy", "✅"].includes(response)) {
      updateSession(userId, { state: "DEPLOYING" });
      await ctx.reply(Messages.deploying());
      await deployWorkflow(ctx, userId);
      return;
    }

    if (["edit", "e", "✏️"].includes(response)) {
      updateSession(userId, {
        state: "CLARIFYING",
        clarifyingAttempts: 0,
      });
      await ctx.reply("What would you like to change?");
      return;
    }

    if (["cancel", "c", "no", "❌"].includes(response)) {
      resetSession(userId);
      await ctx.reply(
        "Cancelled. Send me a new message to start over."
      );
      return;
    }

    // Unrecognised response — stay in CONFIRMING
    await ctx.reply("Please reply with *Yes*, *Edit*, or *Cancel*", {
      parse_mode: "Markdown",
    });
    return;
  }

  // ── CLARIFYING ───────────────────────────────────────────────────────
  if (session.state === "CLARIFYING") {
    const attempts = session.clarifyingAttempts + 1;
    const updatedHistory = [
      ...session.conversationHistory,
      `User: ${messageText}`,
    ];

    updateSession(userId, {
      conversationHistory: updatedHistory,
      clarifyingAttempts: attempts,
    });

    if (attempts >= MAX_CLARIFYING_ATTEMPTS) {
      resetSession(userId);
      await ctx.reply(Messages.tooManyAttempts());
      return;
    }

    console.log(
      `[clarify] Attempt ${attempts} for user ${userId}: "${messageText}"`
    );

    let intent: import("../workflows/types").ParsedIntent;
    try {
      // Pass the CURRENT intent so Gemini merges edits rather than re-parsing
      intent = await parseIntent(messageText, updatedHistory, session.currentIntent ?? undefined);
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && err.name === "RATE_LIMITED";
      if (isRateLimit) {
        // Stay in CLARIFYING — don't lose progress
        await ctx.reply(
          "⏳ Gemini is temporarily rate-limited. Please wait a moment and try again."
        );
      } else {
        await ctx.reply("Something went wrong understanding your request. Please try again.");
      }
      return;
    }

    console.log("Re-parsed intent:", JSON.stringify(intent, null, 2));

    // Guard: if Gemini returned unknown after an edit, keep previous intent
    if (
      (intent.workflowType === "unknown" || intent.confidence < 0.4) &&
      session.currentIntent
    ) {
      await ctx.reply(
        "I couldn't understand that change. Could you rephrase it?\n\n" +
        "Example: \"change the schedule to every hour\" or \"set threshold to 1500\""
      );
      return;
    }

    if (intent.missingRequired.length > 0) {
      updateSession(userId, { currentIntent: intent });
      await ctx.reply(
        Messages.clarify(
          intent.clarifyingQuestion ?? "Can you give me more details?"
        )
      );
      return;
    }

    // All params collected → move to CONFIRMING
    updateSession(userId, {
      currentIntent: intent,
      state: "CONFIRMING",
    });
    await ctx.reply(Messages.confirmationMessage(intent), {
      parse_mode: "Markdown",
    });
    return;
  }

  // ── IDLE / PARSING (default) ───────────────────────────────────────────────────
  const updatedHistory = [
    ...session.conversationHistory,
    `User: ${messageText}`,
  ];

  updateSession(userId, {
    conversationHistory: updatedHistory,
    state: "PARSING",
  });

  console.log(`\n[parse] User ${userId}: "${messageText}"`);

  let intent: import("../workflows/types").ParsedIntent;
  try {
    intent = await parseIntent(messageText, updatedHistory);
  } catch (err: unknown) {
    updateSession(userId, { state: "IDLE" });
    const isRateLimit = err instanceof Error && err.name === "RATE_LIMITED";
    if (isRateLimit) {
      await ctx.reply(
        "⏳ Gemini is temporarily rate-limited. Please wait a moment and send your message again."
      );
    } else {
      await ctx.reply("Something went wrong. Please try again.");
    }
    return;
  }

  console.log("Parsed intent:", JSON.stringify(intent, null, 2));

  // Unknown or low-confidence intent
  if (intent.workflowType === "unknown" || intent.confidence < 0.5) {
    updateSession(userId, { state: "IDLE" });
    await ctx.reply(Messages.cantUnderstand());
    return;
  }

  // Missing required params → start clarification loop
  if (intent.missingRequired.length > 0) {
    updateSession(userId, {
      currentIntent: intent,
      state: "CLARIFYING",
      clarifyingAttempts: 0,
    });
    await ctx.reply(
      Messages.clarify(
        intent.clarifyingQuestion ?? "Can you give me more details?"
      )
    );
    return;
  }

  // All params present → show confirmation
  updateSession(userId, {
    currentIntent: intent,
    state: "CONFIRMING",
  });
  await ctx.reply(Messages.confirmationMessage(intent), {
    parse_mode: "Markdown",
  });
}
