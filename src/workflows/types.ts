// Workflow types the bot supports
export type WorkflowType =
  | "wallet_monitor"
  | "defi_health"
  | "price_alert"
  | "auto_compound"
  | "balance_alert"
  | "unknown";

// Conversation states
export type ConversationState =
  | "IDLE"
  | "DEPLOYING"
  | "SELECTING_PAUSE"
  | "SELECTING_RESUME"
  | "SELECTING_DELETE"
  | "SELECTING_STATUS"
  | "SELECTING_RUN"
  | "SELECTING_EXPORT"
  | "CONFIRMING_DELETE"
  | "AWAITING_JSON_UPLOAD";

export type PendingAction =
  | "pause"
  | "resume"
  | "delete"
  | "status"
  | "run"
  | "export"
  | null;

// Per-user session stored in memory
export interface UserSession {
  telegramUserId: number;
  state: ConversationState;
  deployedWorkflows: DeployedWorkflow[];
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
