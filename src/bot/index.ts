import "dotenv/config";
import { Bot, GrammyError, HttpError } from "grammy";
import { Messages } from "./messages";
import { handleMessage } from "./conversations";
import { getSession, updateSession, resetSession } from "../store/userStore";
import { parseDepTempCommand } from "../templates";
import { buildWorkflow, workflowMeta } from "../workflows/builder";
import { createWorkflow } from "../keeperhub/client";
import { DeployedWorkflow } from "../workflows/types";
import { addWorkflow } from "../store/userStore";

// ─── Validate env ─────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");
}

// ─── Init bot ─────────────────────────────────────────────────────────────────
const bot = new Bot(BOT_TOKEN);

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
    const session = getSession(userId);
    if (session.deployedWorkflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
    } else {
      await ctx.reply(Messages.workflowList(session.deployedWorkflows), {
        parse_mode: "Markdown",
      });
    }
  } catch (err) {
    console.error("[/list] Error:", err);
  }
});

// ─── /pause ───────────────────────────────────────────────────────────────────
bot.command("pause", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);
    const active = session.deployedWorkflows.filter((w) => !w.paused);
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
  }
});

// ─── /resume ──────────────────────────────────────────────────────────────────
bot.command("resume", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);
    const paused = session.deployedWorkflows.filter((w) => w.paused);
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
  }
});

// ─── /delete ──────────────────────────────────────────────────────────────────
bot.command("delete", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);
    if (session.deployedWorkflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
      return;
    }
    updateSession(userId, { state: "SELECTING_DELETE", pendingAction: "delete" });
    await ctx.reply(
      Messages.selectWorkflow(session.deployedWorkflows, "delete"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[/delete] Error:", err);
  }
});

// ─── /status ──────────────────────────────────────────────────────────────────
bot.command("status", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);
    if (session.deployedWorkflows.length === 0) {
      await ctx.reply(Messages.noWorkflows());
      return;
    }
    updateSession(userId, { state: "SELECTING_STATUS", pendingAction: "status" });
    await ctx.reply(
      Messages.selectWorkflow(session.deployedWorkflows, "check status of"),
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("[/status] Error:", err);
  }
});

// ─── /templates ───────────────────────────────────────────────────────────────
bot.command("templates", async (ctx) => {
  try {
    await ctx.reply(Messages.templateList(), { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[/templates] Error:", err);
  }
});

// ─── /dep-temp ────────────────────────────────────────────────────────────────
// Usage: /dep-temp <templateId> <arg1> <arg2> ...
// Bypasses Gemini entirely — builds intent from template, then deploys.
bot.command("dep_temp", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const raw = ctx.message?.text?.replace(/^\/dep[_-]temp\s*/i, "").trim() ?? "";

    if (!raw) {
      await ctx.reply(Messages.templateList(), { parse_mode: "Markdown" });
      return;
    }

    const parsed = parseDepTempCommand(raw);

    if ("error" in parsed) {
      await ctx.reply(parsed.error, { parse_mode: "Markdown" });
      return;
    }

    const { template, intent } = parsed;
    const { name, description } = workflowMeta(intent);

    await ctx.reply(`⟳ Deploying *${name}* from template ${template.emoji}…`, {
      parse_mode: "Markdown",
    });

    let graph;
    try {
      graph = buildWorkflow(intent);
    } catch (buildErr) {
      const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
      await ctx.reply(`❌ Failed to build workflow: ${msg}`);
      return;
    }

    const result = await createWorkflow(name, description, graph);

    if (!result.success || !result.workflowId || !result.workflowUrl) {
      await ctx.reply(
        `❌ KeeperHub deployment failed: ${result.error ?? "unknown error"}`
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

    console.log(`[dep-temp] Deployed "${name}" (${result.workflowId}) for user ${userId}`);
    await ctx.reply(Messages.deploySuccess(name, result.workflowUrl), {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("[/dep-temp] Error:", err);
    await ctx.reply("Something went wrong. Please try again.");
  }
});

// Grammy also registers the hyphen variant
bot.command("dep-temp", async (ctx) => {
  // Grammy normalises hyphens to underscores, but add alias just in case
  const userId = ctx.from?.id;
  if (!userId) return;
  const raw = ctx.message?.text?.replace(/^\/dep[_-]temp\s*/i, "").trim() ?? "";
  if (!raw) {
    await ctx.reply(Messages.templateList(), { parse_mode: "Markdown" });
    return;
  }
  const parsed = parseDepTempCommand(raw);
  if ("error" in parsed) {
    await ctx.reply(parsed.error, { parse_mode: "Markdown" });
    return;
  }
  const { template, intent } = parsed;
  const { name, description } = workflowMeta(intent);
  await ctx.reply(`⟳ Deploying *${name}* from template ${template.emoji}…`, { parse_mode: "Markdown" });
  let graph;
  try { graph = buildWorkflow(intent); } catch (e) {
    await ctx.reply(`❌ Build error: ${e instanceof Error ? e.message : e}`);
    return;
  }
  const result = await createWorkflow(name, description, graph);
  if (!result.success || !result.workflowId || !result.workflowUrl) {
    await ctx.reply(`❌ Deployment failed: ${result.error ?? "unknown"}`);
    return;
  }
  addWorkflow(userId, { id: result.workflowId, name, type: intent.workflowType, url: result.workflowUrl, createdAt: Date.now(), paused: false });
  await ctx.reply(Messages.deploySuccess(name, result.workflowUrl), { parse_mode: "Markdown" });
});

// ─── /natural ─────────────────────────────────────────────────────────────────
// /natural <message> — explicit AI-mode entry point
bot.command("natural", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const text = ctx.message?.text?.replace(/^\/natural\s*/i, "").trim() ?? "";

    if (!text) {
      await ctx.reply(Messages.naturalHelp(), { parse_mode: "Markdown" });
      return;
    }

    await handleMessage(ctx, userId, text);
  } catch (err) {
    console.error("[/natural] Error:", err);
    await ctx.reply("Something went wrong. Please try again.");
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
