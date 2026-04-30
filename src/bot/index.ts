import "dotenv/config";
import { Bot, GrammyError, HttpError } from "grammy";
import { Messages } from "./messages";
import { parseIntent } from "../llm/intentParser";
import { getSession, updateSession } from "../store/userStore";

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
      await ctx.reply(Messages.workflowList(session.deployedWorkflows));
    }
  } catch (err) {
    console.error("[/list] Error:", err);
  }
});

// ─── Text messages → Intent parser ────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    const userMessage = ctx.message.text;

    if (!userId) return;

    // Get or create session
    const session = getSession(userId);

    // Append the incoming message to history
    const updatedHistory = [
      ...session.conversationHistory,
      `User: ${userMessage}`,
    ];
    updateSession(userId, { conversationHistory: updatedHistory });

    // Parse intent via Gemini
    console.log(`\n[Bot] User ${userId} said: "${userMessage}"`);
    const result = await parseIntent(userMessage, updatedHistory);

    // Log the full parsed intent for Stage 1 verification
    console.log("Parsed intent:", JSON.stringify(result, null, 2));

    // ── Stage 1 stub reply ──────────────────────────────────────────────────
    // Full conversation flow (clarification, confirmation, deployment)
    // is implemented in Stage 2.
    await ctx.reply(
      "⚙️ Got it, processing… _(Stage 2 will handle this fully)_",
      { parse_mode: "Markdown" }
    );
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
