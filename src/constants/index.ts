export const SUPPORTED_CHAINS = [
  "ethereum",
  "base",
  "arbitrum",
  "polygon",
] as const;

export const SUPPORTED_PROTOCOLS = ["aave", "compound", "morpho"] as const;

export const SUPPORTED_WORKFLOW_TYPES = [
  "wallet_monitor",
  "defi_health",
  "price_alert",
  "auto_compound",
  "balance_alert",
] as const;

export const MAX_CLARIFYING_ATTEMPTS = 3;

export const KEEPERHUB_BASE_URL = "https://api.keeperhub.com";

export const WORKFLOW_EXAMPLES = {
  wallet_monitor: "Alert me when wallet 0x1234 receives more than 1 ETH",
  defi_health: "Warn me if my Aave health factor drops below 1.5",
  price_alert: "Tell me when ETH drops below $2000",
  auto_compound: "Claim and reinvest my Aave rewards every Sunday",
  balance_alert: "Alert me when my USDC on Base drops below 500",
};
