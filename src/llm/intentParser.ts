import { GoogleGenerativeAI } from "@google/generative-ai";
import { ParsedIntent } from "../workflows/types";
import { buildIntentPrompt } from "./prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.1,
  },
});

// ─── Retry with exponential backoff ──────────────────────────────────────────

const RETRY_DELAYS_MS = [2000, 5000, 10000]; // 3 attempts total

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(prompt: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("rate");

      console.warn(
        `[intentParser] Gemini attempt ${attempt + 1} failed: ${errMsg}`
      );

      if (isRateLimit && attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        console.log(`[intentParser] Rate limited — retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // Non-rate-limit error — don't retry
      break;
    }
  }

  throw lastError;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parses a user message into a structured ParsedIntent using Gemini.
 *
 * @param userMessage     The raw user input.
 * @param conversationHistory  Last N lines of chat history.
 * @param currentIntent   If set, Gemini will update/merge rather than re-parse from scratch.
 *                        Pass this when the user is in an EDIT flow.
 *
 * Returns an "unknown" intent on unrecoverable error, or throws if retries
 * are exhausted due to rate limiting so callers can show a friendly message.
 */
export async function parseIntent(
  userMessage: string,
  conversationHistory: string[],
  currentIntent?: ParsedIntent
): Promise<ParsedIntent> {
  const historyString = conversationHistory.slice(-6).join("\n");
  const prompt = buildIntentPrompt(userMessage, historyString, currentIntent);

  try {
    const text = await generateWithRetry(prompt);
    const parsed = JSON.parse(text) as ParsedIntent;
    return parsed;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const isRateLimit =
      errMsg.includes("429") ||
      errMsg.toLowerCase().includes("quota") ||
      errMsg.toLowerCase().includes("rate");

    console.error("[intentParser] Gemini error:", errMsg);

    if (isRateLimit) {
      // Propagate a typed error so the bot can show a human-friendly message
      const re = new Error("RATE_LIMITED");
      re.name = "RATE_LIMITED";
      throw re;
    }

    // Generic fallback for non-rate-limit errors
    return {
      workflowType: "unknown",
      confidence: 0,
      parameters: {
        walletAddress: null,
        token: null,
        threshold: null,
        direction: null,
        protocol: null,
        chain: null,
        schedule: null,
        metric: null,
        minRewardUSD: null,
      },
      missingRequired: [],
      clarifyingQuestion: null,
    };
  }
}
