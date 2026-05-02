import "dotenv/config";
import { Bot, GrammyError, HttpError } from "grammy";
import { Messages } from "./messages";
import { handleMessage } from "./conversations";
import {
  getSession,
  updateSession,
  resetSession,
  replaceWorkflows,
} from "../store/userStore";
import { createWorkflow, listWorkflows } from "../keeperhub/client";
import { DeployedWorkflow } from "../workflows/types";

// ─── Validate env ─────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");
}

// ─── Init bot ─────────────────────────────────────────────────────────────────
const bot = new Bot(BOT_TOKEN);

async function refreshWorkflows(userId: number): Promise<DeployedWorkflow[]> {
  const workflows = await listWorkflows();
  replaceWorkflows(userId, workflows);
  return workflows;
}

function workflowFetchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Could not fetch workflows from KeeperHub.\n\nError: ${message}`;
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  try {
    await ctx.reply(Messages.welcome());
  } catch (err) {
    console.error("[/start] Error:", err);
  }
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.command("help", async (ctx) => {
  try {
    await ctx.reply(Messages.help(), { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[/help] Error:", err);
  }
});

// ─── /list ────────────────────────────────────────────────────────────────────
bot.command("list", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const workflows = await refreshWorkflows(userId);
    if (workflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
    } else {
      await ctx.reply(Messages.workflowList(workflows), {
        parse_mode: "Markdown",
      });
    }
  } catch (err) {
    console.error("[/list] Error:", err);
    await ctx.reply(workflowFetchError(err));
  }
});

// ─── /pause ───────────────────────────────────────────────────────────────────
bot.command("pause", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const workflows = await refreshWorkflows(userId);
    const active = workflows.filter((w) => !w.paused);
    if (active.length === 0) {
      await ctx.reply("No active workflows to pause.");
      return;
    }
    updateSession(userId, { state: "SELECTING_PAUSE", pendingAction: "pause" });
    await ctx.reply(Messages.selectWorkflow(active, "pause"), {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("[/pause] Error:", err);
    await ctx.reply(workflowFetchError(err));
  }
});

// ─── /resume ──────────────────────────────────────────────────────────────────
bot.command("resume", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const workflows = await refreshWorkflows(userId);
    const paused = workflows.filter((w) => w.paused);
    if (paused.length === 0) {
      await ctx.reply("No paused workflows to resume.");
      return;
    }
    updateSession(userId, { state: "SELECTING_RESUME", pendingAction: "resume" });
    await ctx.reply(Messages.selectWorkflow(paused, "resume"), {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("[/resume] Error:", err);
    await ctx.reply(workflowFetchError(err));
  }
});

// ─── /delete ──────────────────────────────────────────────────────────────────
bot.command("delete", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const workflows = await refreshWorkflows(userId);
    if (workflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
      return;
    }
    updateSession(userId, { state: "SELECTING_DELETE", pendingAction: "delete" });
    await ctx.reply(
      Messages.selectWorkflow(workflows, "delete"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[/delete] Error:", err);
    await ctx.reply(workflowFetchError(err));
  }
});

// ─── /status ──────────────────────────────────────────────────────────────────
bot.command("status", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const workflows = await refreshWorkflows(userId);
    if (workflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
      return;
    }
    updateSession(userId, { state: "SELECTING_STATUS", pendingAction: "status" });
    await ctx.reply(
      Messages.selectWorkflow(workflows, "check status of"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[/status] Error:", err);
    await ctx.reply(workflowFetchError(err));
  }
});

// ─── /run ─────────────────────────────────────────────────────────────────────
bot.command("run", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const workflows = await refreshWorkflows(userId);
    if (workflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
      return;
    }
    updateSession(userId, { state: "SELECTING_RUN", pendingAction: "run" });
    await ctx.reply(
      Messages.selectWorkflow(workflows, "run now"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[/run] Error:", err);
    await ctx.reply(workflowFetchError(err));
  }
});

// ─── /export ──────────────────────────────────────────────────────────────────
bot.command("export", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const workflows = await refreshWorkflows(userId);
    if (workflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
      return;
    }
    updateSession(userId, { state: "SELECTING_EXPORT", pendingAction: "export" });
    await ctx.reply(
      Messages.selectWorkflow(workflows, "export as JSON"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[/export] Error:", err);
    await ctx.reply(workflowFetchError(err));
  }
});

// ─── /cancel ──────────────────────────────────────────────────────────────────
bot.command("cancel", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    resetSession(userId);
    await ctx.reply("Cancelled.");
  } catch (err) {
    console.error("[/cancel] Error:", err);
  }
});

// ─── /jsonup ─────────────────────────────────────────────────────────────────
// Puts the user in AWAITING_JSON_UPLOAD state; next document message deploys.
bot.command("jsonup", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    updateSession(userId, { state: "AWAITING_JSON_UPLOAD" });
    await ctx.reply(Messages.jsonupPrompt(), { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[/jsonup] Error:", err);
  }
});

// ─── Document upload handler (used by /jsonup) ────────────────────────────────
bot.on("message:document", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const session = getSession(userId);
    if (session.state !== "AWAITING_JSON_UPLOAD") {
      // Not in upload mode — ignore silently
      return;
    }

    const doc = ctx.message.document;
    const fileName = doc.file_name ?? "workflow.json";

    // ── 1. Validate file type ──────────────────────────────────────────────────
    if (!fileName.toLowerCase().endsWith(".json") && doc.mime_type !== "application/json") {
      await ctx.reply(
        "⚠️ Please send a `.json` file.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // ── 2. Download the file ──────────────────────────────────────────────────
    let rawText: string;
    try {
      const fileInfo = await ctx.api.getFile(doc.file_id);
      const filePath = fileInfo.file_path;
      if (!filePath) throw new Error("Telegram returned no file_path");

      const botToken = process.env.TELEGRAM_BOT_TOKEN!;
      const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      rawText = await response.text();
    } catch (dlErr) {
      const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
      console.error("[/jsonup] Download error:", msg);
      await ctx.reply(Messages.jsonupParseError(`Could not download file — ${msg}`), {
        parse_mode: "Markdown",
      });
      return;
    }

    // ── 3. Parse JSON ─────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (jsonErr) {
      const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
      await ctx.reply(Messages.jsonupParseError(msg), { parse_mode: "Markdown" });
      return;
    }

    // ── 4. Validate structure ─────────────────────────────────────────────────
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      await ctx.reply(Messages.jsonupInvalidFile(), { parse_mode: "Markdown" });
      return;
    }

    const workflowName: string =
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : fileName.replace(/\.json$/i, "");

    const workflowDescription: string =
      typeof parsed.description === "string" ? parsed.description : "Imported via Rigel bot";

    // ── 5. Deploy ─────────────────────────────────────────────────────────────
    updateSession(userId, { state: "DEPLOYING" });
    await ctx.reply(Messages.jsonupDeploying(workflowName), { parse_mode: "Markdown" });

    const graph = { nodes: parsed.nodes, edges: parsed.edges };
    const result = await createWorkflow(workflowName, workflowDescription, graph);

    if (!result.success || !result.workflowId || !result.workflowUrl) {
      updateSession(userId, { state: "IDLE" });
      await ctx.reply(
        `❌ KeeperHub deployment failed: ${result.error ?? "unknown error"}`
      );
      return;
    }

    // ── 6. Refresh & notify ───────────────────────────────────────────────────
    await refreshWorkflows(userId);
    updateSession(userId, { state: "IDLE" });

    console.log(`[jsonup] Deployed "${workflowName}" (${result.workflowId}) for user ${userId}`);
    await ctx.reply(Messages.deploySuccess(workflowName, result.workflowUrl), {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("[message:document] Error:", err);
    await ctx.reply("Something went wrong processing the file. Please try again.");
  }
});


// ─── Text messages → Conversation state machine ───────────────────────────────
bot.on("message:text", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const text = ctx.message.text;

    // Let Grammy command middleware handle slash commands
    if (text.startsWith("/")) return;

    await handleMessage(ctx, userId, text);
  } catch (err) {
    console.error("[message:text] Error:", err);
    await ctx.reply("Something went wrong. Please try again.");
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[bot.catch] Error for update ${ctx.update.update_id}:`);

  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Grammy error:", e.description);
  } else if (e instanceof HttpError) {
    console.error("HTTP error:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
bot.start({
  onStart: () => console.log("🚀 Rigel bot is running!"),
});
