import { ParsedIntent } from "../workflows/types";
import { KHNode, KHEdge, KHWorkflowGraph } from "../keeperhub/client";

// ─── Chain → network ID mapping ───────────────────────────────────────────────

const CHAIN_NETWORK: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  arbitrum: "42161",
  polygon: "137",
};

function networkId(chain: string | null): string {
  return CHAIN_NETWORK[chain ?? "ethereum"] ?? "1";
}

// ─── Cron schedule helpers ─────────────────────────────────────────────────────

/** Convert a natural-language schedule string to cron. Defaults to every 10 min. */
function toCron(schedule: string | null): string {
  if (!schedule) return "*/10 * * * *";
  const s = schedule.toLowerCase();
  if (s.includes("5 min")) return "*/5 * * * *";
  if (s.includes("10 min")) return "*/10 * * * *";
  if (s.includes("15 min")) return "*/15 * * * *";
  if (s.includes("30 min")) return "*/30 * * * *";
  if (s.includes("hour")) return "0 * * * *";
  if (s.includes("6 hour")) return "0 */6 * * *";
  if (s.includes("12 hour")) return "0 */12 * * *";
  if (s.includes("daily") || s.includes("day")) return "0 12 * * *";
  return "*/10 * * * *";
}

// ─── Node position helpers ─────────────────────────────────────────────────────

function pos(col: number, row: number = 0): { x: number; y: number } {
  return { x: 100 + col * 275, y: 250 + row * 175 };
}

// ─── Telegram notification node ────────────────────────────────────────────────

/**
 * Builds a webhook/send-webhook action node that posts a message to the Rigel
 * Telegram bot. In production this could point to the bot's self-webhook.
 * For now it uses a generic webhook placeholder.
 */
function telegramAlertNode(
  id: string,
  col: number,
  row: number,
  label: string,
  message: string
): KHNode {
  return {
    id,
    type: "action",
    position: pos(col, row),
    data: {
      type: "action",
      label,
      config: {
        actionType: "webhook/send-webhook",
        webhookUrl: process.env.ALERT_WEBHOOK_URL ?? "https://example.com/webhook",
        webhookMethod: "POST",
        webhookHeaders: JSON.stringify({ "Content-Type": "application/json" }),
        webhookPayload: JSON.stringify({ text: message }),
      },
    },
  };
}

// ─── Per-workflow builders ─────────────────────────────────────────────────────

/**
 * wallet_monitor — monitors a wallet for incoming / outgoing transactions.
 * Pattern: Schedule trigger → check-balance → condition → alert / resolve
 */
function buildWalletMonitor(intent: ParsedIntent): KHWorkflowGraph {
  const p = intent.parameters;
  const address = p.walletAddress ?? "0x0000000000000000000000000000000000000000";
  const network = networkId(p.chain);
  const threshold = p.threshold ?? 0;
  const direction = p.direction ?? "below";
  const condExpr =
    direction === "above"
      ? `{{@check-balance:Check Balance.balance}} > ${threshold}`
      : `{{@check-balance:Check Balance.balance}} < ${threshold}`;

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: "Schedule",
        config: { triggerType: "Schedule", scheduleCron: toCron(p.schedule) },
      },
    },
    {
      id: "check-balance",
      type: "action",
      position: pos(1),
      data: {
        type: "action",
        label: "Check Balance",
        config: { actionType: "web3/check-balance", network, address },
      },
    },
    {
      id: "condition",
      type: "action",
      position: pos(2),
      data: {
        type: "action",
        label: `Balance ${direction === "above" ? ">" : "<"} ${threshold}`,
        config: { actionType: "Condition", condition: condExpr },
      },
    },
    telegramAlertNode(
      "alert",
      3,
      -1,
      "🔔 Alert",
      `⚠️ Wallet ${address.slice(0, 6)}… balance threshold breached! Current: {{@check-balance:Check Balance.balance}}`
    ),
    telegramAlertNode(
      "resolve",
      3,
      1,
      "✅ Resolve",
      `✅ Wallet ${address.slice(0, 6)}… balance restored. Current: {{@check-balance:Check Balance.balance}}`
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger", target: "check-balance" },
    { id: "e2", source: "check-balance", target: "condition" },
    { id: "e3", source: "condition", target: "alert", sourceHandle: "true", type: "animated" },
    { id: "e4", source: "condition", target: "resolve", sourceHandle: "false", type: "animated" },
  ];

  return { nodes, edges };
}

/**
 * balance_alert — same pattern as wallet_monitor but token-aware label.
 */
function buildBalanceAlert(intent: ParsedIntent): KHWorkflowGraph {
  return buildWalletMonitor(intent); // same graph, different name
}

/**
 * price_alert — monitors a token price feed.
 * Pattern: Schedule → read-price → condition → alert / resolve
 */
function buildPriceAlert(intent: ParsedIntent): KHWorkflowGraph {
  const p = intent.parameters;
  const token = (p.token ?? "ETH").toUpperCase();
  const threshold = p.threshold ?? 0;
  const direction = p.direction ?? "below";
  const network = networkId(p.chain);

  // Use Chainlink ETH/USD as an example oracle address; real impl would
  // look up token → oracle mapping from a registry.
  const oracleAddress = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419"; // ETH/USD mainnet

  const condExpr =
    direction === "above"
      ? `{{@read-price:Read Price.answer}} > ${threshold}`
      : `{{@read-price:Read Price.answer}} < ${threshold}`;

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: "Schedule",
        config: { triggerType: "Schedule", scheduleCron: toCron(p.schedule) },
      },
    },
    {
      id: "read-price",
      type: "action",
      position: pos(1),
      data: {
        type: "action",
        label: `Read ${token} Price`,
        config: {
          actionType: "web3/read-contract",
          network,
          address: oracleAddress,
          functionName: "latestAnswer",
          args: [],
        },
      },
    },
    {
      id: "condition",
      type: "action",
      position: pos(2),
      data: {
        type: "action",
        label: `${token} ${direction === "above" ? ">" : "<"} $${threshold}`,
        config: { actionType: "Condition", condition: condExpr },
      },
    },
    telegramAlertNode(
      "alert",
      3,
      -1,
      "🔔 Price Alert",
      `🚨 ${token} price threshold hit! Current: {{@read-price:Read Price.answer}}`
    ),
    telegramAlertNode(
      "resolve",
      3,
      1,
      "✅ Resolved",
      `✅ ${token} price back to normal. Current: {{@read-price:Read Price.answer}}`
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger", target: "read-price" },
    { id: "e2", source: "read-price", target: "condition" },
    { id: "e3", source: "condition", target: "alert", sourceHandle: "true", type: "animated" },
    { id: "e4", source: "condition", target: "resolve", sourceHandle: "false", type: "animated" },
  ];

  return { nodes, edges };
}

/**
 * defi_health — monitors health factor / LTV on Aave / Compound / Morpho.
 * Pattern: Schedule → read-health → condition → alert / resolve
 */
function buildDeFiHealth(intent: ParsedIntent): KHWorkflowGraph {
  const p = intent.parameters;
  const protocol = p.protocol ?? "aave";
  const metric = p.metric ?? "healthFactor";
  const threshold = p.threshold ?? 1.5;
  const network = networkId(p.chain);
  const address = p.walletAddress ?? "0x0000000000000000000000000000000000000000";

  // Protocol → data provider address (Aave v3 Ethereum mainnet as default)
  const protocolContracts: Record<string, string> = {
    aave: "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3", // Aave v3 Pool Data Provider
    compound: "0xc0da02939e1441f497fd74f78ce7decb17b66529", // Compound v3 Mainnet
    morpho: "0x9648d66c716e05b7d97e2aa51f9bfa42c35b8909", // Morpho Blue mainnet
  };
  const contractAddress = protocolContracts[protocol] ?? protocolContracts.aave;

  // Label mapping
  const metricLabel: Record<string, string> = {
    healthFactor: "Health Factor",
    ltv: "LTV",
    collateralRatio: "Collateral Ratio",
  };

  const condExpr = `{{@read-health:Read Health.healthFactor}} < ${threshold}`;

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: "Schedule",
        config: { triggerType: "Schedule", scheduleCron: toCron(p.schedule) },
      },
    },
    {
      id: "read-health",
      type: "action",
      position: pos(1),
      data: {
        type: "action",
        label: `Read ${metricLabel[metric] ?? metric}`,
        config: {
          actionType: "web3/read-contract",
          network,
          address: contractAddress,
          functionName: "getUserAccountData",
          args: [address],
        },
      },
    },
    {
      id: "condition",
      type: "action",
      position: pos(2),
      data: {
        type: "action",
        label: `${metricLabel[metric] ?? metric} < ${threshold}`,
        config: { actionType: "Condition", condition: condExpr },
      },
    },
    telegramAlertNode(
      "alert",
      3,
      -1,
      "⚠️ Health Alert",
      `🚨 ${protocol.toUpperCase()} health factor critical! Current: {{@read-health:Read Health.healthFactor}} (threshold: ${threshold})`
    ),
    telegramAlertNode(
      "resolve",
      3,
      1,
      "✅ Healthy",
      `✅ ${protocol.toUpperCase()} health factor restored. Current: {{@read-health:Read Health.healthFactor}}`
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger", target: "read-health" },
    { id: "e2", source: "read-health", target: "condition" },
    { id: "e3", source: "condition", target: "alert", sourceHandle: "true", type: "animated" },
    { id: "e4", source: "condition", target: "resolve", sourceHandle: "false", type: "animated" },
  ];

  return { nodes, edges };
}

/**
 * auto_compound — daily harvest of staking / LP rewards.
 * Pattern: Schedule → read-rewards → condition → write-harvest
 */
function buildAutoCompound(intent: ParsedIntent): KHWorkflowGraph {
  const p = intent.parameters;
  const protocol = p.protocol ?? "aave";
  const minReward = p.minRewardUSD ?? 10;
  const network = networkId(p.chain);
  const address = p.walletAddress ?? "0x0000000000000000000000000000000000000000";

  // Placeholder contract addresses per protocol
  const harvestContracts: Record<string, string> = {
    aave: "0x357d51124f59836ded84c8a1730d72b749d8bc23", // Aave Incentives Controller
    compound: "0xc0da02939e1441f497fd74f78ce7decb17b66529",
    morpho: "0x9648d66c716e05b7d97e2aa51f9bfa42c35b8909",
  };
  const contractAddress = harvestContracts[protocol] ?? harvestContracts.aave;

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: toCron(p.schedule) === "0 12 * * *" ? "Daily 12:00 UTC" : "Schedule",
        config: { triggerType: "Schedule", scheduleCron: toCron(p.schedule) },
      },
    },
    {
      id: "read-rewards",
      type: "action",
      position: pos(1),
      data: {
        type: "action",
        label: "Read Pending Rewards",
        config: {
          actionType: "web3/read-contract",
          network,
          address: contractAddress,
          functionName: "getUserRewards",
          args: [[address], address, "0x0000000000000000000000000000000000000000"],
        },
      },
    },
    {
      id: "condition",
      type: "action",
      position: pos(2),
      data: {
        type: "action",
        label: `Rewards > $${minReward}`,
        config: {
          actionType: "Condition",
          condition: `{{@read-rewards:Read Pending Rewards.result}} > ${minReward}`,
        },
      },
    },
    {
      id: "harvest",
      type: "action",
      position: pos(3, -0.5),
      data: {
        type: "action",
        label: "Harvest Rewards",
        config: {
          actionType: "web3/write-contract",
          network,
          address: contractAddress,
          functionName: "claimRewards",
          args: [[address], address, "0x0000000000000000000000000000000000000000"],
        },
      },
    },
    telegramAlertNode(
      "notify",
      4,
      0.5,
      "📢 Compounded",
      `✅ ${protocol.toUpperCase()} rewards harvested! Amount: {{@read-rewards:Read Pending Rewards.result}}`
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger", target: "read-rewards" },
    { id: "e2", source: "read-rewards", target: "condition" },
    { id: "e3", source: "condition", target: "harvest", sourceHandle: "true", type: "animated" },
    { id: "e4", source: "harvest", target: "notify" },
  ];

  return { nodes, edges };
}

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * Build a KeeperHub node/edge graph for the given parsed intent.
 * Throws if the workflow type is not supported.
 */
export function buildWorkflow(intent: ParsedIntent): KHWorkflowGraph {
  switch (intent.workflowType) {
    case "wallet_monitor":
      return buildWalletMonitor(intent);
    case "balance_alert":
      return buildBalanceAlert(intent);
    case "price_alert":
      return buildPriceAlert(intent);
    case "defi_health":
      return buildDeFiHealth(intent);
    case "auto_compound":
      return buildAutoCompound(intent);
    default:
      throw new Error(`Unsupported workflow type: ${intent.workflowType}`);
  }
}

/** Derive a human-readable name + description from a parsed intent. */
export function workflowMeta(intent: ParsedIntent): {
  name: string;
  description: string;
} {
  const p = intent.parameters;

  switch (intent.workflowType) {
    case "wallet_monitor":
      return {
        name: "Wallet Monitor",
        description: `Monitor wallet ${p.walletAddress ?? "unknown"} on ${p.chain ?? "Ethereum"} for balance changes below ${p.threshold ?? "threshold"}.`,
      };
    case "balance_alert":
      return {
        name: `${(p.token ?? "Token").toUpperCase()} Balance Alert`,
        description: `Alert when ${p.token ?? "token"} balance in ${p.walletAddress ?? "wallet"} crosses ${p.threshold ?? "threshold"}.`,
      };
    case "price_alert":
      return {
        name: `${(p.token ?? "Token").toUpperCase()} Price Alert`,
        description: `Trigger when ${p.token ?? "token"} price goes ${p.direction ?? "below"} $${p.threshold ?? "threshold"} on ${p.chain ?? "Ethereum"}.`,
      };
    case "defi_health":
      return {
        name: `${(p.protocol ?? "DeFi").charAt(0).toUpperCase() + (p.protocol ?? "defi").slice(1)} Health Monitor`,
        description: `Monitor ${p.metric ?? "health factor"} on ${p.protocol ?? "DeFi"} for wallet ${p.walletAddress ?? "unknown"}. Alert below ${p.threshold ?? "threshold"}.`,
      };
    case "auto_compound":
      return {
        name: `${(p.protocol ?? "DeFi").charAt(0).toUpperCase() + (p.protocol ?? "defi").slice(1)} Auto-Compound`,
        description: `Automatically harvest rewards on ${p.protocol ?? "DeFi"} when they exceed $${p.minRewardUSD ?? "10"}.`,
      };
    default:
      return { name: "Custom Workflow", description: "Rigel-generated workflow." };
  }
}
