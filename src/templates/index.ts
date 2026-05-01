import {
  ParsedIntent,
  ExtractedParams,
  WorkflowType,
  Chain,
  Protocol,
  Direction,
  Metric,
} from "../workflows/types";

// ─── Template definition ──────────────────────────────────────────────────────

export interface TemplateParam {
  name: string;
  label: string;
  example: string;
  optional?: boolean;
}

export interface WorkflowTemplate {
  id: number;
  workflowType: WorkflowType;
  name: string;
  description: string;
  emoji: string;
  params: TemplateParam[];
  build: (args: string[]) => ParsedIntent;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const VALID_DIRECTIONS: Direction[] = ["above", "below", "incoming", "outgoing"];
const VALID_CHAINS: Chain[] = ["ethereum", "base", "arbitrum", "polygon"];
const VALID_PROTOCOLS: Protocol[] = ["aave", "compound", "morpho"];

function toDirection(s: string | undefined, fallback: Direction): Direction {
  return VALID_DIRECTIONS.includes(s as Direction)
    ? (s as Direction)
    : fallback;
}

function toChain(s: string | undefined, fallback: Chain): Chain {
  return VALID_CHAINS.includes(s as Chain) ? (s as Chain) : fallback;
}

function toProtocol(s: string | undefined, fallback: Protocol): Protocol {
  return VALID_PROTOCOLS.includes(s as Protocol) ? (s as Protocol) : fallback;
}

// ─── Template catalogue ───────────────────────────────────────────────────────

export const TEMPLATES: WorkflowTemplate[] = [

  // ─── 1. Token Price Alert ─────────────────────────────────────────────────
  {
    id: 1,
    workflowType: "price_alert",
    name: "Token Price Alert",
    emoji: "📈",
    description: "Get a Telegram alert when a token price crosses a threshold.",
    params: [
      { name: "token",     label: "Token symbol",    example: "ETH" },
      { name: "threshold", label: "Price (USD)",      example: "2000" },
      { name: "direction", label: "above / below",   example: "below" },
    ],
    build([token, thresholdStr, direction]: string[]): ParsedIntent {
      const threshold = parseFloat(thresholdStr);
      const parameters: ExtractedParams = {
        ...base(),
        token:     token ?? "ETH",
        threshold: isNaN(threshold) ? 2000 : threshold,
        direction: toDirection(direction, "below"),
        // FIX: price alerts are chain-agnostic — price feeds are global
        chain: null,
      };
      return {
        workflowType: "price_alert",
        confidence: 1,
        missingRequired: [],
        clarifyingQuestion: null,
        parameters,
      };
    },
  },

  // ─── 2. Wallet Transfer Monitor ───────────────────────────────────────────
  // FIX: renamed from "Wallet Balance Monitor" — workflowType "wallet_monitor"
  // tracks transfers (incoming/outgoing), not balance levels.
  // Use Template 5 (balance_alert) for balance level monitoring.
  {
    id: 2,
    workflowType: "wallet_monitor",
    name: "Wallet Transfer Monitor",
    emoji: "💼",
    description:
      "Get a Telegram alert when a wallet receives or sends a transfer above a threshold.",
    params: [
      { name: "walletAddress", label: "Wallet address",          example: "0xABC..." },
      { name: "token",         label: "Token (ETH/USDC/…)",      example: "ETH" },
      { name: "threshold",     label: "Amount threshold",        example: "1" },
      { name: "direction",     label: "incoming / outgoing",     example: "incoming" },
      { name: "chain",         label: "Chain",                   example: "ethereum", optional: true },
    ],
    build([address, token, thresholdStr, direction, chain]: string[]): ParsedIntent {
      const threshold = parseFloat(thresholdStr);
      const parameters: ExtractedParams = {
        ...base(),
        walletAddress: address ?? null,
        token:         token ?? "ETH",
        threshold:     isNaN(threshold) ? 1 : threshold,
        // FIX: default to "incoming" — more common use case for wallet monitoring
        direction:     toDirection(direction, "incoming"),
        chain:         toChain(chain, "ethereum"),
      };
      return {
        workflowType: "wallet_monitor",
        confidence: 1,
        missingRequired: [],
        clarifyingQuestion: null,
        parameters,
      };
    },
  },

  // ─── 3. DeFi Health Monitor ───────────────────────────────────────────────
  {
    id: 3,
    workflowType: "defi_health",
    name: "DeFi Health Monitor",
    emoji: "🏥",
    description:
      "Get a Telegram alert when your Aave/Compound/Morpho health factor drops below a threshold.",
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
        threshold:     isNaN(threshold) ? 1.5 : threshold,
        protocol:      toProtocol(protocol, "aave"),
        metric:        "healthFactor" as Metric,
        chain:         toChain(chain, "ethereum"),
        // FIX: direction is always "below" for health factor alerts
        direction:     "below",
      };
      return {
        workflowType: "defi_health",
        confidence: 1,
        missingRequired: [],
        clarifyingQuestion: null,
        parameters,
      };
    },
  },

  // ─── 4. Auto-Compound Rewards ─────────────────────────────────────────────
  {
    id: 4,
    workflowType: "auto_compound",
    name: "Auto-Compound Rewards",
    emoji: "🔄",
    description:
      "Automatically harvest and reinvest DeFi rewards on a schedule. Sends a Telegram confirmation after each compound.",
    params: [
      { name: "walletAddress", label: "Wallet address",   example: "0xABC..." },
      { name: "protocol",      label: "Protocol",         example: "aave" },
      // FIX: schedule was hardcoded to "daily" with no user input — now a param
      { name: "schedule",      label: "daily / weekly",   example: "daily",    optional: true },
      { name: "minRewardUSD",  label: "Min reward (USD)", example: "10",       optional: true },
      { name: "chain",         label: "Chain",            example: "ethereum", optional: true },
    ],
    build([address, protocol, schedule, minRewardStr, chain]: string[]): ParsedIntent {
      const minRewardUSD = parseFloat(minRewardStr);
      const parameters: ExtractedParams = {
        ...base(),
        walletAddress: address ?? null,
        protocol:      toProtocol(protocol, "aave"),
        // FIX: respect user's schedule input, default to "daily"
        schedule:      schedule ?? "daily",
        minRewardUSD:  isNaN(minRewardUSD) ? 10 : minRewardUSD,
        chain:         toChain(chain, "ethereum"),
      };
      return {
        workflowType: "auto_compound",
        confidence: 1,
        missingRequired: [],
        clarifyingQuestion: null,
        parameters,
      };
    },
  },

  // ─── 5. Token Balance Alert ───────────────────────────────────────────────
  {
    id: 5,
    workflowType: "balance_alert",
    name: "Token Balance Alert",
    emoji: "💰",
    description:
      "Get a Telegram alert when a specific token balance drops below a threshold.",
    params: [
      { name: "walletAddress", label: "Wallet address",  example: "0xABC..." },
      { name: "token",         label: "Token symbol",    example: "USDC" },
      { name: "threshold",     label: "Minimum balance", example: "500" },
      // FIX: example was "base" but default was "ethereum" — now consistent
      { name: "chain",         label: "Chain",           example: "ethereum", optional: true },
    ],
    build([address, token, thresholdStr, chain]: string[]): ParsedIntent {
      const threshold = parseFloat(thresholdStr);
      const parameters: ExtractedParams = {
        ...base(),
        walletAddress: address ?? null,
        token:         token ?? "USDC",
        threshold:     isNaN(threshold) ? 500 : threshold,
        direction:     "below",
        chain:         toChain(chain, "ethereum"),
      };
      return {
        workflowType: "balance_alert",
        confidence: 1,
        missingRequired: [],
        clarifyingQuestion: null,
        parameters,
      };
    },
  },
];

// ─── Public helpers ───────────────────────────────────────────────────────────

export function getTemplate(id: number): WorkflowTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function parseDepTempCommand(
  rawArgs: string
): { template: WorkflowTemplate; intent: ParsedIntent } | { error: string } {
  const parts = rawArgs.trim().split(/\s+/);
  const id = parseInt(parts[0], 10);

  if (isNaN(id)) {
    return {
      error: "Please specify a template number.\n\nExample: `/deptemp 1 ETH 2000 below`",
    };
  }

  const template = getTemplate(id);
  if (!template) {
    return {
      error: `Template #${id} does not exist. Send /templates to see all options.`,
    };
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
        `Usage: \`/deptemp ${id} ${usage}\`\n\n` +
        template.params
          .map(
            (p, i) =>
              `  ${i + 1}\\. ${p.label}${p.optional ? " _(optional)_" : ""}`
          )
          .join("\n"),
    };
  }

  const intent = template.build(userArgs);
  return { template, intent };
}