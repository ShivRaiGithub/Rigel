import { Context } from "grammy";
import { Messages } from "./messages";
import { parseIntent } from "../llm/intentParser";
import {
  getSession,
  updateSession,
  resetSession,
  addWorkflow,
} from "../store/userStore";
import { DeployedWorkflow, ParsedIntent } from "../workflows/types";
import { MAX_CLARIFYING_ATTEMPTS } from "../constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a human-readable workflow name from a parsed intent. */
function workflowName(intent: ParsedIntent): string {
  const p = intent.parameters;
  switch (intent.workflowType) {
    case "price_alert":
      return `${(p.token ?? "Token").toUpperCase()} Price Alert`;
    case "wallet_monitor":
      return `Wallet Monitor`;
    case "defi_health": {
      const proto = p.protocol
        ? p.protocol.charAt(0).toUpperCase() + p.protocol.slice(1)
        : "DeFi";
      return `${proto} Health Monitor`;
    }
    case "auto_compound": {
      const proto = p.protocol
        ? p.protocol.charAt(0).toUpperCase() + p.protocol.slice(1)
        : "DeFi";
      return `${proto} Auto-Compound`;
    }
    case "balance_alert":
      return `${(p.token ?? "Token").toUpperCase()} Balance Alert`;
    default:
      return "Custom Workflow";
  }
}

// ─── Deploy stub ──────────────────────────────────────────────────────────────

/**
 * Stage 2: stubbed deployment — simulates a 1.5 s API call and returns a
 * fake workflow ID.  The real KeeperHub call replaces this in Stage 3.
 */
async function deployWorkflow(ctx: Context, userId: number): Promise<void> {
  const session = getSession(userId);
  const intent = session.currentIntent!;

  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const workflowId = "wf_" + Math.random().toString(36).substr(2, 9);
  const workflowUrl = `https://keeperhub.com/workflows/${workflowId}`;
  const name = workflowName(intent);

  const deployed: DeployedWorkflow = {
    id: workflowId,
    name,
    type: intent.workflowType,
    url: workflowUrl,
    createdAt: Date.now(),
    paused: false,
  };

  addWorkflow(userId, deployed);

  // Reset session, but addWorkflow already saved the workflow so it persists
  resetSession(userId);

  console.log(`[deploy] Deployed "${name}" (${workflowId}) for user ${userId}`);

  await ctx.reply(Messages.deploySuccess(name, workflowUrl), {
    parse_mode: "Markdown",
  });
}

// ─── Core state machine ───────────────────────────────────────────────────────

/**
 * Routes an incoming text message through the conversation state machine.
 * States: IDLE → PARSING → CLARIFYING → CONFIRMING → DEPLOYING
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

  // ── CLARIFYING ─────────────────────────────────────────────────────────────
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
    const intent = await parseIntent(messageText, updatedHistory);
    console.log("Re-parsed intent:", JSON.stringify(intent, null, 2));

    if (intent.missingRequired.length > 0) {
      updateSession(userId, { currentIntent: intent });
      await ctx.reply(
        Messages.clarify(
          intent.clarifyingQuestion ?? "Can you give me more details?"
        )
      );
      return;
    }

    // All params now collected → move to CONFIRMING
    updateSession(userId, {
      currentIntent: intent,
      state: "CONFIRMING",
    });
    await ctx.reply(Messages.confirmationMessage(intent), {
      parse_mode: "Markdown",
    });
    return;
  }

  // ── IDLE / PARSING (default) ───────────────────────────────────────────────
  const updatedHistory = [
    ...session.conversationHistory,
    `User: ${messageText}`,
  ];

  updateSession(userId, {
    conversationHistory: updatedHistory,
    state: "PARSING",
  });

  console.log(`\n[parse] User ${userId}: "${messageText}"`);
  const intent = await parseIntent(messageText, updatedHistory);
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
