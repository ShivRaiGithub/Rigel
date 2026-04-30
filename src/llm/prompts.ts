export function buildIntentPrompt(
  userMessage: string,
  conversationHistory: string
): string {
  return `You are an intent parser for a Telegram bot that creates KeeperHub \
onchain automation workflows.

Read the user message and return structured JSON.

SUPPORTED WORKFLOW TYPES:
- wallet_monitor: watch a wallet address for transfers
- defi_health: monitor Aave/Compound/Morpho position health factor
- price_alert: alert when token price crosses a threshold
- auto_compound: automatically claim and reinvest DeFi rewards on a schedule
- balance_alert: alert when wallet token balance drops below a threshold

SUPPORTED CHAINS: ethereum, base, arbitrum, polygon
SUPPORTED PROTOCOLS: aave, compound, morpho

REQUIRED PARAMETERS PER TYPE:
- wallet_monitor: walletAddress, token, threshold, direction, chain
- defi_health: walletAddress, protocol, metric, threshold, chain
- price_alert: token, direction, threshold
- auto_compound: walletAddress, protocol, chain, schedule
- balance_alert: walletAddress, token, threshold, chain

CONVERSATION HISTORY:
${conversationHistory || "No previous messages"}

USER MESSAGE:
${userMessage}

Return ONLY this JSON structure with no explanation:
{
  "workflowType": "wallet_monitor|defi_health|price_alert|auto_compound|balance_alert|unknown",
  "confidence": 0.0,
  "parameters": {
    "walletAddress": null,
    "token": null,
    "threshold": null,
    "direction": null,
    "protocol": null,
    "chain": null,
    "schedule": null,
    "metric": null,
    "minRewardUSD": null
  },
  "missingRequired": [],
  "clarifyingQuestion": null
}

Rules:
- missingRequired lists parameter names that are required but not found
- clarifyingQuestion is a single specific question for the MOST important missing param
- clarifyingQuestion is null if missingRequired is empty
- confidence is 0.0-1.0 how certain you are of the workflow type
- Default chain to "ethereum" if not specified
- Default metric to "healthFactor" for defi_health if not specified
- Default direction to "incoming" for wallet_monitor if not specified`;
}
