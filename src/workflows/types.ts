// Workflow types the bot supports
export type WorkflowType =
  | "wallet_monitor"
  | "defi_health"
  | "price_alert"
  | "auto_compound"
  | "balance_alert"
  | "unknown";

export type Chain = "ethereum" | "base" | "arbitrum" | "polygon";
export type Protocol = "aave" | "compound" | "morpho";
export type Direction = "above" | "below" | "incoming" | "outgoing";
export type Metric = "healthFactor" | "ltv" | "collateralRatio";

// Parameters extracted from user message by LLM
export interface ExtractedParams {
  walletAddress: string | null;
  token: string | null;
  threshold: number | null;
  direction: Direction | null;
  protocol: Protocol | null;
  chain: Chain | null;
  schedule: string | null;
  metric: Metric | null;
  minRewardUSD: number | null;
}

// What the LLM returns after parsing
export interface ParsedIntent {
  workflowType: WorkflowType;
  confidence: number;
  parameters: ExtractedParams;
  missingRequired: string[];
  clarifyingQuestion: string | null;
}

// Conversation states
export type ConversationState =
  | "IDLE"
  | "PARSING"
  | "CLARIFYING"
  | "CONFIRMING"
  | "DEPLOYING"
  | "SELECTING_PAUSE"
  | "SELECTING_RESUME"
  | "SELECTING_DELETE"
  | "SELECTING_STATUS"
  | "CONFIRMING_DELETE"
  | "AWAITING_JSON_UPLOAD";

export type PendingAction = "pause" | "resume" | "delete" | "status" | null;

// Per-user session stored in memory
export interface UserSession {
  telegramUserId: number;
  state: ConversationState;
  currentIntent: ParsedIntent | null;
  conversationHistory: string[];
  clarifyingAttempts: number;
  deployedWorkflows: DeployedWorkflow[];
  // Stage 4: management flow
  pendingAction: PendingAction;
  pendingDeleteWorkflow: DeployedWorkflow | null;
}

// A workflow that has been deployed to KeeperHub
export interface DeployedWorkflow {
  id: string;
  name: string;
  type: WorkflowType;
  url: string;
  createdAt: number;
  paused: boolean;
}

// KeeperHub workflow JSON structure
export interface KeeperHubWorkflow {
  name: string;
  description: string;
  project_id: string;
  nodes: KeeperHubNode[];
  edges: KeeperHubEdge[];
}

export interface KeeperHubNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface KeeperHubEdge {
  id: string;
  source: string;
  target: string;
}

// Result of deploying a workflow to KeeperHub
export interface DeployResult {
  success: boolean;
  workflowId?: string;
  workflowUrl?: string;
  error?: string;
}
