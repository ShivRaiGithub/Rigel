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

/**
 * Parses a user message into a structured ParsedIntent using Gemini.
 * Falls back to an "unknown" intent on any error.
 */
export async function parseIntent(
  userMessage: string,
  conversationHistory: string[]
): Promise<ParsedIntent> {
  // Use only the last 6 history entries to keep context tight
  const historyString = conversationHistory.slice(-6).join("\n");
  const prompt = buildIntentPrompt(userMessage, historyString);

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text) as ParsedIntent;
    return parsed;
  } catch (error) {
    console.error("[intentParser] Gemini error:", error);
    // Return a safe fallback so the bot doesn't crash
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
