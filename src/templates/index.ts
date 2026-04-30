import { ParsedIntent, ExtractedParams, WorkflowType, Chain, Protocol, Direction, Metric } from "../workflows/types";

// ─── Template definition ──────────────────────────────────────────────────────

export interface TemplateParam {
  name: string;       // internal key
  label: string;      // display label shown in /templates
  example: string;    // used in usage string
  optional?: boolean;
}

export interface WorkflowTemplate {
  id: number;
  workflowType: WorkflowType;
  name: string;
  description: string;
  emoji: string;
  params: TemplateParam[];
  /** Build a fully-populated ParsedIntent from the ordered CLI args */
  build: (args: string[]) => ParsedIntent;
}

// ─── Empty parameter baseline ─────────────────────────────────────────────────

function base(): ExtractedParams {
  return {
    walletAddress: null,
    token: null,
    threshold: null,
    direction: null,
    protocol: null,
    chain: null,
    schedule: null,
    metric: null,
    minRewardUSD: null,
  };
}

// ─── Template catalogue ───────────────────────────────────────────────────────

export const TEMPLATES: WorkflowTemplate[] = [
  // ─── 1. Token Price Alert ─────────────────────────────────────────────────
  {
    id: 1,
    workflowType: "price_alert",
    name: "Token Price Alert",
    emoji: "📈",
    description: "Alert when a token price crosses a threshold.",
    params: [
      { name: "token",     label: "Token symbol",    example: "ETH" },
      { name: "threshold", label: "Price threshold", example: "2000" },
      { name: "direction", label: "above / below",   example: "below" },
      { name: "schedule",  label: "Check interval",  example: "every hour", optional: true },
    ],
    build([token, thresholdStr, direction, schedule]: string[]): ParsedIntent {
      const threshold = parseFloat(thresholdStr);
      const parameters: ExtractedParams = {
        ...base(),
        token: token ?? "ETH",
        threshold: isNaN(threshold) ? 2000 : threshold,
        direction: (direction as Direction) ?? "below",
        chain: "ethereum",
        schedule: schedule ?? null,
      };
      return { workflowType: "price_alert", confidence: 1, missingRequired: [], clarifyingQuestion: null, parameters };
    },
  },

  // ─── 2. Wallet Balance Monitor ────────────────────────────────────────────
  {
    id: 2,
    workflowType: "wallet_monitor",
    name: "Wallet Balance Monitor",
    emoji: "💼",
    description: "Alert when a wallet's native balance crosses a threshold.",
    params: [
      { name: "walletAddress", label: "Wallet address", example: "0xABC..." },
      { name: "threshold",     label: "ETH threshold",  example: "1" },
      { name: "direction",     label: "above / below",  example: "below" },
      { name: "chain",         label: "Chain",          example: "ethereum", optional: true },
    ],
    build([address, thresholdStr, direction, chain]: string[]): ParsedIntent {
      const threshold = parseFloat(thresholdStr);
      const parameters: ExtractedParams = {
        ...base(),
        walletAddress: address ?? null,
        threshold: isNaN(threshold) ? 1 : threshold,
        direction: (direction as Direction) ?? "below",
        token: "ETH",
        chain: (chain as Chain) ?? "ethereum",
      };
      return { workflowType: "wallet_monitor", confidence: 1, missingRequired: [], clarifyingQuestion: null, parameters };
    },
  },

  // ─── 3. DeFi Health Monitor ───────────────────────────────────────────────
  {
    id: 3,
    workflowType: "defi_health",
    name: "DeFi Health Monitor",
    emoji: "🏥",
    description: "Alert when your Aave/Compound/Morpho health factor drops below a threshold.",
    params: [
      { name: "walletAddress", label: "Wallet address",   example: "0xABC..." },
      { name: "threshold",     label: "Health threshold", example: "1.5" },
      { name: "protocol",      label: "Protocol",         example: "aave",     optional: true },
      { name: "chain",         label: "Chain",            example: "ethereum", optional: true },
    ],
    build([address, thresholdStr, protocol, chain]: string[]): ParsedIntent {
      const threshold = parseFloat(thresholdStr);
      const parameters: ExtractedParams = {
        ...base(),
        walletAddress: address ?? null,
        threshold: isNaN(threshold) ? 1.5 : threshold,
        protocol: (protocol as Protocol) ?? "aave",
        metric: "healthFactor" as Metric,
        chain: (chain as Chain) ?? "ethereum",
      };
      return { workflowType: "defi_health", confidence: 1, missingRequired: [], clarifyingQuestion: null, parameters };
    },
  },

  // ─── 4. Auto-Compound Rewards ─────────────────────────────────────────────
  {
    id: 4,
    workflowType: "auto_compound",
    name: "Auto-Compound Rewards",
    emoji: "🔄",
    description: "Automatically harvest and reinvest DeFi rewards on a schedule.",
    params: [
      { name: "walletAddress", label: "Wallet address",  example: "0xABC..." },
      { name: "protocol",      label: "Protocol",        example: "aave" },
      { name: "minRewardUSD",  label: "Min reward (USD)", example: "10",        optional: true },
      { name: "chain",         label: "Chain",           example: "ethereum",   optional: true },
    ],
    build([address, protocol, minRewardStr, chain]: string[]): ParsedIntent {
      const minRewardUSD = parseFloat(minRewardStr);
      const parameters: ExtractedParams = {
        ...base(),
        walletAddress: address ?? null,
        protocol: (protocol as Protocol) ?? "aave",
        minRewardUSD: isNaN(minRewardUSD) ? 10 : minRewardUSD,
        chain: (chain as Chain) ?? "ethereum",
        schedule: "daily",
      };
      return { workflowType: "auto_compound", confidence: 1, missingRequired: [], clarifyingQuestion: null, parameters };
    },
  },

  // ─── 5. Token Balance Alert ───────────────────────────────────────────────
  {
    id: 5,
    workflowType: "balance_alert",
    name: "Token Balance Alert",
    emoji: "💰",
    description: "Alert when a specific token balance drops below a threshold.",
    params: [
      { name: "walletAddress", label: "Wallet address",  example: "0xABC..." },
      { name: "token",         label: "Token symbol",    example: "USDC" },
      { name: "threshold",     label: "Balance min",     example: "500" },
      { name: "chain",         label: "Chain",           example: "base",     optional: true },
    ],
    build([address, token, thresholdStr, chain]: string[]): ParsedIntent {
      const threshold = parseFloat(thresholdStr);
      const parameters: ExtractedParams = {
        ...base(),
        walletAddress: address ?? null,
        token: token ?? "USDC",
        threshold: isNaN(threshold) ? 500 : threshold,
        direction: "below" as Direction,
        chain: (chain as Chain) ?? "ethereum",
      };
      return { workflowType: "balance_alert", confidence: 1, missingRequired: [], clarifyingQuestion: null, parameters };
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Find a template by its 1-based ID. */
export function getTemplate(id: number): WorkflowTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Parse a /dep-temp argument string of the form:
 *   <id> <arg1> <arg2> ...
 *
 * Returns the template + intent on success, or an error string on failure.
 */
export function parseDepTempCommand(
  rawArgs: string
): { template: WorkflowTemplate; intent: ParsedIntent } | { error: string } {
  const parts = rawArgs.trim().split(/\s+/);
  const id = parseInt(parts[0], 10);

  if (isNaN(id)) {
    return { error: "Please specify a template number.\n\nExample: `/dep-temp 1 ETH 2000 below`" };
  }

  const template = getTemplate(id);
  if (!template) {
    return { error: `Template #${id} does not exist. Send /templates to see all options.` };
  }

  const requiredParams = template.params.filter((p) => !p.optional);
  const userArgs = parts.slice(1);

  if (userArgs.length < requiredParams.length) {
    const usage = template.params
      .map((p) => (p.optional ? `[${p.example}]` : `<${p.example}>`))
      .join(" ");
    return {
      error:
        `❌ Not enough arguments for *${template.name}*\\.\n\n` +
        `Usage: \`/dep-temp ${id} ${usage}\`\n\n` +
        template.params
          .map((p, i) => `  ${i + 1}\\. ${p.label}${p.optional ? " _(optional)_" : ""}`)
          .join("\n"),
    };
  }

  const intent = template.build(userArgs);
  return { template, intent };
}
