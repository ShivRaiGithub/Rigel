import {
  UserSession,
  DeployedWorkflow,
  ParsedIntent,
} from "../workflows/types";

const store = new Map<number, UserSession>();

function createDefaultSession(userId: number): UserSession {
  return {
    telegramUserId: userId,
    state: "IDLE",
    currentIntent: null,
    conversationHistory: [],
    clarifyingAttempts: 0,
    deployedWorkflows: [],
    pendingAction: null,
    pendingDeleteWorkflow: null,
  };
}

/**
 * Returns an existing session or creates a new IDLE one.
 */
export function getSession(userId: number): UserSession {
  if (!store.has(userId)) {
    store.set(userId, createDefaultSession(userId));
  }
  return store.get(userId)!;
}

/**
 * Merges partial updates into the user's existing session.
 */
export function updateSession(
  userId: number,
  updates: Partial<UserSession>
): void {
  const session = getSession(userId);
  store.set(userId, { ...session, ...updates });
}

/**
 * Resets session to IDLE state, clears intent & history.
 * Preserves deployedWorkflows.
 */
export function resetSession(userId: number): void {
  const session = getSession(userId);
  store.set(userId, {
    ...createDefaultSession(userId),
    deployedWorkflows: session.deployedWorkflows,
  });
}

/**
 * Appends a deployed workflow to the user's list.
 */
export function addWorkflow(
  userId: number,
  workflow: DeployedWorkflow
): void {
  const session = getSession(userId);
  updateSession(userId, {
    deployedWorkflows: [...session.deployedWorkflows, workflow],
  });
}

/**
 * Removes a workflow by ID from the user's list.
 */
export function removeWorkflow(userId: number, workflowId: string): void {
  const session = getSession(userId);
  updateSession(userId, {
    deployedWorkflows: session.deployedWorkflows.filter(
      (w) => w.id !== workflowId
    ),
  });
}

/**
 * Updates the paused flag for a single workflow in the user's list.
 */
export function updateWorkflowPaused(
  userId: number,
  workflowId: string,
  paused: boolean
): void {
  const session = getSession(userId);
  updateSession(userId, {
    deployedWorkflows: session.deployedWorkflows.map((w) =>
      w.id === workflowId ? { ...w, paused } : w
    ),
  });
}
