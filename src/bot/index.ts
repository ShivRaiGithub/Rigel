import "dotenv/config";
import { Bot, GrammyError, HttpError } from "grammy";
import { Messages } from "./messages";
import { handleMessage } from "./conversations";
import { getSession, updateSession, resetSession } from "../store/userStore";

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
