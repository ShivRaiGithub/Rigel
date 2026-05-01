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

// ─── Cron schedule helpers ────────────────────────────────────────────────────

function toCron(schedule: string | null): string {
  if (!schedule) return "*/10 * * * *";
  const s = schedule.toLowerCase();
  if (s.includes("5 min"))  return "*/5 * * * *";
  if (s.includes("10 min")) return "*/10 * * * *";
  if (s.includes("15 min")) return "*/15 * * * *";
  if (s.includes("30 min")) return "*/30 * * * *";
  if (s.includes("hour"))   return "0 * * * *";
  if (s.includes("6 hour")) return "0 */6 * * *";
  if (s.includes("12 hour"))return "0 */12 * * *";
  if (s.includes("daily") || s.includes("day")) return "0 12 * * *";
  if (s.includes("weekly") || s.includes("week")) return "0 12 * * 0";
  return "*/10 * * * *";
}

// ─── Node position helpers ────────────────────────────────────────────────────

function pos(col: number, row: number = 0): { x: number; y: number } {
  return { x: 100 + col * 275, y: 250 + row * 175 };
}

// ─── Telegram notification node ───────────────────────────────────────────────

/**
 * FIX: Was sending to a generic webhook placeholder (https://example.com/webhook).
 * Now calls the Telegram Bot API directly with the user's chat ID,
 * so the alert actually reaches the user who set up the workflow.
 *
 * Requires in environment:
 *   TELEGRAM_BOT_TOKEN  — the bot token from @BotFather
 *
 * chatId is passed at build time from the user's Telegram session.
 */
function telegramAlertNode(
  id: string,
  col: number,
  row: number,
  label: string,
  message: string,
  chatId: string
): KHNode {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  return {
    id,
    type: "action",
    position: pos(col, row),
    data: {
      type: "action",
      label,
      config: {
        actionType: "webhook/send-webhook",
        webhookUrl: telegramUrl,
        webhookMethod: "POST",
        webhookHeaders: JSON.stringify({ "Content-Type": "application/json" }),
        webhookPayload: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      },
    },
  };
}

// ─── Chainlink oracle addresses per token per network ─────────────────────────

/**
 * FIX: Was hardcoded to ETH/USD on mainnet for every token and chain.
 * Now maps token → chain → oracle address.
 * Falls back to ETH/USD mainnet if unknown.
 */
const PRICE_ORACLES: Record<string, Record<string, string>> = {
  ETH: {
    "1":     "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // Ethereum mainnet
    "8453":  "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", // Base
    "42161": "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", // Arbitrum
    "137":   "0xF9680D99D6C9589e2a93a78A04A279e509205945", // Polygon
  },
  BTC: {
    "1":     "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88b",
    "42161": "0x6ce185860a4963106506C203335A2910413708e9",
  },
  USDC: {
    "1":     "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    "42161": "0x50834F3163758fcC1Df9973b657Ab5Be029DD196",
  },
  USDT: {
    "1":     "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
  },
  SOL: {
    "1":     "0x4ffC43a60e009B551865A93d232E33Fce9f01507",
  },
};

function getOracleAddress(token: string, network: string): string {
  const tokenUpper = token.toUpperCase();
  return (
    PRICE_ORACLES[tokenUpper]?.[network] ??
    PRICE_ORACLES["ETH"]["1"] // safe fallback
  );
}

// ─── ERC-20 token addresses per network ──────────────────────────────────────

const ERC20_ADDRESSES: Record<string, Record<string, string>> = {
  USDC: {
    "1":     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "8453":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "137":   "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  },
  USDT: {
    "1":     "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "42161": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    "137":   "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  },
  WETH: {
    "1":     "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "8453":  "0x4200000000000000000000000000000000000006",
    "42161": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "137":   "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  },
};

function getERC20Address(token: string, network: string): string | null {
  return ERC20_ADDRESSES[token.toUpperCase()]?.[network] ?? null;
}

// ─── Per-workflow builders ────────────────────────────────────────────────────

/**
 * wallet_monitor — monitors incoming or outgoing native ETH transfers.
 * FIX: direction is now actually used in the condition and alert message.
 */
function buildWalletMonitor(
  intent: ParsedIntent,
  chatId: string
): KHWorkflowGraph {
  const p = intent.parameters;
  const address  = p.walletAddress ?? "0x0000000000000000000000000000000000000000";
  const network  = networkId(p.chain);
  const threshold = p.threshold ?? 0;
  const token    = (p.token ?? "ETH").toUpperCase();
  // FIX: use direction properly — "incoming" means balance rose, "outgoing" means it fell
  const direction = p.direction ?? "incoming";

  const condExpr =
    direction === "incoming" || direction === "above"
      ? `{{@check-balance:Check Balance.balance}} > ${threshold}`
      : `{{@check-balance:Check Balance.balance}} < ${threshold}`;

  const alertMsg =
    direction === "incoming"
      ? `💸 <b>Incoming Transfer Detected</b>\nWallet: <code>${address.slice(0, 8)}…</code>\nBalance now: {{@check-balance:Check Balance.balance}} ${token}`
      : `💸 <b>Outgoing Transfer Detected</b>\nWallet: <code>${address.slice(0, 8)}…</code>\nBalance now: {{@check-balance:Check Balance.balance}} ${token}`;

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
        label: `Balance ${direction === "incoming" || direction === "above" ? ">" : "<"} ${threshold} ${token}`,
        config: { actionType: "Condition", condition: condExpr },
      },
    },
    telegramAlertNode("alert", 3, -1, "🔔 Transfer Alert", alertMsg, chatId),
    telegramAlertNode(
      "resolve",
      3,
      1,
      "✅ Back to Normal",
      `✅ <b>Balance back to normal</b>\nWallet: <code>${address.slice(0, 8)}…</code>\nBalance now: {{@check-balance:Check Balance.balance}} ${token}`,
      chatId
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger",       target: "check-balance" },
    { id: "e2", source: "check-balance", target: "condition" },
    { id: "e3", source: "condition",     target: "alert",   sourceHandle: "true",  type: "animated" },
    { id: "e4", source: "condition",     target: "resolve", sourceHandle: "false", type: "animated" },
  ];

  return { nodes, edges };
}

/**
 * balance_alert — monitors an ERC-20 token balance (or native ETH).
 * FIX: was identical to wallet_monitor. Now uses balanceOf() for ERC-20 tokens,
 * falling back to native balance check for ETH/unknown tokens.
 */
function buildBalanceAlert(
  intent: ParsedIntent,
  chatId: string
): KHWorkflowGraph {
  const p = intent.parameters;
  const address   = p.walletAddress ?? "0x0000000000000000000000000000000000000000";
  const network   = networkId(p.chain);
  const token     = (p.token ?? "USDC").toUpperCase();
  const threshold = p.threshold ?? 500;
  const erc20     = getERC20Address(token, network);

  // Choose the right action type depending on whether it's an ERC-20 or native
  const balanceAction: KHNode = erc20
    ? {
        id: "check-balance",
        type: "action",
        position: pos(1),
        data: {
          type: "action",
          label: `Read ${token} Balance`,
          config: {
            actionType: "web3/read-contract",
            network,
            address: erc20,
            functionName: "balanceOf",
            args: [address],
          },
        },
      }
    : {
        id: "check-balance",
        type: "action",
        position: pos(1),
        data: {
          type: "action",
          label: "Check Native Balance",
          config: { actionType: "web3/check-balance", network, address },
        },
      };

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: "Schedule",
        config: { triggerType: "Schedule", scheduleCron: "0 * * * *" }, // hourly
      },
    },
    balanceAction,
    {
      id: "condition",
      type: "action",
      position: pos(2),
      data: {
        type: "action",
        label: `${token} < ${threshold}`,
        config: {
          actionType: "Condition",
          condition: `{{@check-balance:${erc20 ? `Read ${token} Balance` : "Check Native Balance"}.${erc20 ? "result" : "balance"}}} < ${threshold}`,
        },
      },
    },
    telegramAlertNode(
      "alert",
      3,
      -1,
      "💰 Low Balance",
      `⚠️ <b>Low ${token} Balance</b>\nWallet: <code>${address.slice(0, 8)}…</code>\nCurrent balance: {{@check-balance:${erc20 ? `Read ${token} Balance` : "Check Native Balance"}.${erc20 ? "result" : "balance"}}} ${token}\nThreshold: ${threshold} ${token}`,
      chatId
    ),
    telegramAlertNode(
      "resolve",
      3,
      1,
      "✅ Balance OK",
      `✅ <b>${token} balance restored</b>\nWallet: <code>${address.slice(0, 8)}…</code>\nCurrent: {{@check-balance:${erc20 ? `Read ${token} Balance` : "Check Native Balance"}.${erc20 ? "result" : "balance"}}} ${token}`,
      chatId
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger",       target: "check-balance" },
    { id: "e2", source: "check-balance", target: "condition" },
    { id: "e3", source: "condition",     target: "alert",   sourceHandle: "true",  type: "animated" },
    { id: "e4", source: "condition",     target: "resolve", sourceHandle: "false", type: "animated" },
  ];

  return { nodes, edges };
}

/**
 * price_alert — monitors a token price via Chainlink oracle.
 * FIX: oracle address now resolved per token + chain instead of
 * always using ETH/USD mainnet.
 */
function buildPriceAlert(
  intent: ParsedIntent,
  chatId: string
): KHWorkflowGraph {
  const p = intent.parameters;
  const token     = (p.token ?? "ETH").toUpperCase();
  const threshold = p.threshold ?? 0;
  const direction = p.direction ?? "below";
  // FIX: price alerts are chain-agnostic for the user's perspective,
  // but the oracle lives on a specific chain — default to ethereum mainnet
  const network = networkId(p.chain ?? "ethereum");
  const oracle  = getOracleAddress(token, network);

  const condExpr =
    direction === "above"
      ? `{{@read-price:Read ${token} Price.answer}} > ${threshold}`
      : `{{@read-price:Read ${token} Price.answer}} < ${threshold}`;

  const dirSymbol = direction === "above" ? "📈" : "📉";

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: "Schedule",
        config: { triggerType: "Schedule", scheduleCron: "*/5 * * * *" },
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
          address: oracle,
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
      `${dirSymbol} Price Alert`,
      `${dirSymbol} <b>${token} Price Alert</b>\nCurrent price: {{@read-price:Read ${token} Price.answer}}\nYour threshold: ${direction} $${threshold}`,
      chatId
    ),
    telegramAlertNode(
      "resolve",
      3,
      1,
      "✅ Price Normalised",
      `✅ <b>${token} price back to normal</b>\nCurrent price: {{@read-price:Read ${token} Price.answer}}`,
      chatId
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger",    target: "read-price" },
    { id: "e2", source: "read-price", target: "condition" },
    { id: "e3", source: "condition",  target: "alert",   sourceHandle: "true",  type: "animated" },
    { id: "e4", source: "condition",  target: "resolve", sourceHandle: "false", type: "animated" },
  ];

  return { nodes, edges };
}

/**
 * defi_health — monitors health factor on Aave / Compound / Morpho.
 */
function buildDeFiHealth(
  intent: ParsedIntent,
  chatId: string
): KHWorkflowGraph {
  const p         = intent.parameters;
  const protocol  = p.protocol ?? "aave";
  const metric    = p.metric ?? "healthFactor";
  const threshold = p.threshold ?? 1.5;
  const network   = networkId(p.chain);
  const address   = p.walletAddress ?? "0x0000000000000000000000000000000000000000";

  const protocolContracts: Record<string, string> = {
    aave:     "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3",
    compound: "0xc0da02939e1441f497fd74f78ce7decb17b66529",
    morpho:   "0x9648d66c716e05b7d97e2aa51f9bfa42c35b8909",
  };
  const contractAddress = protocolContracts[protocol] ?? protocolContracts.aave;

  const metricLabel: Record<string, string> = {
    healthFactor:    "Health Factor",
    ltv:             "LTV",
    collateralRatio: "Collateral Ratio",
  };
  const label = metricLabel[metric] ?? metric;

  const condExpr = `{{@read-health:Read ${label}.healthFactor}} < ${threshold}`;

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: "Schedule",
        config: { triggerType: "Schedule", scheduleCron: "*/5 * * * *" },
      },
    },
    {
      id: "read-health",
      type: "action",
      position: pos(1),
      data: {
        type: "action",
        label: `Read ${label}`,
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
        label: `${label} < ${threshold}`,
        config: { actionType: "Condition", condition: condExpr },
      },
    },
    telegramAlertNode(
      "alert",
      3,
      -1,
      "🚨 Health Critical",
      `🚨 <b>${protocol.toUpperCase()} ${label} Critical</b>\nWallet: <code>${address.slice(0, 8)}…</code>\nCurrent: {{@read-health:Read ${label}.healthFactor}}\nThreshold: ${threshold}\n\n⚡ Add collateral or repay debt now to avoid liquidation.`,
      chatId
    ),
    telegramAlertNode(
      "resolve",
      3,
      1,
      "✅ Position Healthy",
      `✅ <b>${protocol.toUpperCase()} position healthy</b>\nWallet: <code>${address.slice(0, 8)}…</code>\n${label}: {{@read-health:Read ${label}.healthFactor}}`,
      chatId
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger",     target: "read-health" },
    { id: "e2", source: "read-health", target: "condition" },
    { id: "e3", source: "condition",   target: "alert",   sourceHandle: "true",  type: "animated" },
    { id: "e4", source: "condition",   target: "resolve", sourceHandle: "false", type: "animated" },
  ];

  return { nodes, edges };
}

/**
 * auto_compound — harvests DeFi rewards on a schedule.
 * FIX: added a "skip" notification when rewards are below threshold
 * so user knows the workflow ran but didn't compound.
 * FIX: notification message now labels the amount as raw units
 * rather than implying it is a USD value.
 */
function buildAutoCompound(
  intent: ParsedIntent,
  chatId: string
): KHWorkflowGraph {
  const p         = intent.parameters;
  const protocol  = p.protocol ?? "aave";
  const minReward = p.minRewardUSD ?? 10;
  const network   = networkId(p.chain);
  const address   = p.walletAddress ?? "0x0000000000000000000000000000000000000000";

  const harvestContracts: Record<string, string> = {
    aave:     "0x357d51124f59836ded84c8a1730d72b749d8bc23",
    compound: "0xc0da02939e1441f497fd74f78ce7decb17b66529",
    morpho:   "0x9648d66c716e05b7d97e2aa51f9bfa42c35b8909",
  };
  const contractAddress = harvestContracts[protocol] ?? harvestContracts.aave;
  const cronExpr = toCron(p.schedule);

  const nodes: KHNode[] = [
    {
      id: "trigger",
      type: "trigger",
      position: pos(0),
      data: {
        type: "trigger",
        label: "Schedule",
        config: { triggerType: "Schedule", scheduleCron: cronExpr },
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
    // FIX: compound success notification — labels amount as raw units, not USD
    telegramAlertNode(
      "notify-success",
      4,
      -0.5,
      "✅ Compounded",
      `✅ <b>${protocol.toUpperCase()} rewards harvested</b>\nWallet: <code>${address.slice(0, 8)}…</code>\nRaw amount: {{@read-rewards:Read Pending Rewards.result}}\nSchedule: ${cronExpr}`,
      chatId
    ),
    // FIX: added skip notification so user knows the workflow ran but did nothing
    telegramAlertNode(
      "notify-skip",
      3,
      1,
      "⏭ Skipped",
      `⏭ <b>${protocol.toUpperCase()} compound skipped</b>\nRewards below threshold of $${minReward}\nCurrent: {{@read-rewards:Read Pending Rewards.result}} raw units`,
      chatId
    ),
  ];

  const edges: KHEdge[] = [
    { id: "e1", source: "trigger",      target: "read-rewards" },
    { id: "e2", source: "read-rewards", target: "condition" },
    { id: "e3", source: "condition",    target: "harvest",       sourceHandle: "true",  type: "animated" },
    { id: "e4", source: "condition",    target: "notify-skip",   sourceHandle: "false", type: "animated" },
    { id: "e5", source: "harvest",      target: "notify-success" },
  ];

  return { nodes, edges };
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Build a KeeperHub node/edge graph for the given parsed intent.
 * chatId is the Telegram user's chat ID — passed to every notification node
 * so alerts actually reach the user who created the workflow.
 */
export function buildWorkflow(
  intent: ParsedIntent,
  chatId: string
): KHWorkflowGraph {
  switch (intent.workflowType) {
    case "wallet_monitor":  return buildWalletMonitor(intent, chatId);
    case "balance_alert":   return buildBalanceAlert(intent, chatId);
    case "price_alert":     return buildPriceAlert(intent, chatId);
    case "defi_health":     return buildDeFiHealth(intent, chatId);
    case "auto_compound":   return buildAutoCompound(intent, chatId);
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
  const proto = p.protocol
    ? p.protocol.charAt(0).toUpperCase() + p.protocol.slice(1)
    : "DeFi";

  switch (intent.workflowType) {
    case "wallet_monitor":
      return {
        name: `Wallet Transfer Monitor`,
        description: `Watch ${p.walletAddress?.slice(0, 8) ?? "wallet"}… on ${p.chain ?? "Ethereum"} for ${p.direction ?? "incoming"} transfers above ${p.threshold ?? "threshold"} ${(p.token ?? "ETH").toUpperCase()}.`,
      };
    case "balance_alert":
      return {
        name: `${(p.token ?? "Token").toUpperCase()} Balance Alert`,
        description: `Alert when ${(p.token ?? "token").toUpperCase()} balance in ${p.walletAddress?.slice(0, 8) ?? "wallet"}… drops below ${p.threshold ?? "threshold"} on ${p.chain ?? "Ethereum"}.`,
      };
    case "price_alert":
      return {
        name: `${(p.token ?? "Token").toUpperCase()} Price Alert`,
        // FIX: removed "on Ethereum" — price alerts are chain-agnostic
        description: `Alert when ${(p.token ?? "token").toUpperCase()} goes ${p.direction ?? "below"} $${p.threshold ?? "threshold"}.`,
      };
    case "defi_health":
      return {
        name: `${proto} Health Monitor`,
        description: `Alert when ${p.metric ?? "health factor"} on ${proto} for ${p.walletAddress?.slice(0, 8) ?? "wallet"}… drops below ${p.threshold ?? "threshold"}.`,
      };
    case "auto_compound":
      return {
        name: `${proto} Auto-Compound`,
        description: `Harvest ${proto} rewards for ${p.walletAddress?.slice(0, 8) ?? "wallet"}… when they exceed $${p.minRewardUSD ?? 10}. Schedule: ${p.schedule ?? "daily"}.`,
      };
    default:
      return { name: "Custom Workflow", description: "Rigel-generated workflow." };
  }
}