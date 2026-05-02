import { DeployResult } from "../workflows/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KHNode {
  id: string;
  type: "trigger" | "action";
  position?: { x: number; y: number };
  data: {
    type: "trigger" | "action";
    label: string;
    config: Record<string, unknown>;
  };
}

export interface KHEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: "true" | "false";
  type?: "animated";
}

export interface KHWorkflowGraph {
  nodes: KHNode[];
  edges: KHEdge[];
}

interface KHCreateResponse {
  id: string;
  name: string;
}

interface KHErrorResponse {
  error?: string | { message?: string; code?: string };
  message?: string;
}

export interface WorkflowExecutionResult {
  executionId?: string;
  runId?: string;
  status?: string;
}

type KeeperHubWorkflowResponse = Record<string, unknown>;

class KeeperHubHttpError extends Error {
  constructor(
    public method: string,
    public path: string,
    public status: number,
    message: string
  ) {
    super(`KeeperHub ${method} ${path} failed — ${message}`);
    this.name = "KeeperHubHttpError";
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Base URL for all KeeperHub REST calls.
 * Override via KEEPERHUB_BASE_URL if your org uses a different host
 * (e.g. https://app.keeperhub.com/api).
 */
const BASE_URL =
  (process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com/api").replace(
    /\/$/,
    ""
  );

function getHeaders(): Record<string, string> {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    throw new Error("KEEPERHUB_API_KEY is not set in environment variables");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function formatKeeperHubError(
  method: string,
  path: string,
  status: number,
  statusText: string,
  errBody?: KHErrorResponse
): KeeperHubHttpError {
  const nestedMessage =
    typeof errBody?.error === "object" ? errBody.error.message : errBody?.error;
  const message = `HTTP ${status}: ${nestedMessage ?? errBody?.message ?? statusText}`;
  return new KeeperHubHttpError(method, path, status, message);
}

async function khRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let errBody: KHErrorResponse | undefined;
    try {
      errBody = (await res.json()) as KHErrorResponse;
    } catch {
      // Keep the original HTTP status text if the error body is not JSON.
    }
    throw formatKeeperHubError(method, path, res.status, res.statusText, errBody);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;

  const parsed = JSON.parse(text) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    "data" in parsed &&
    Object.keys(parsed).length === 1
  ) {
    return (parsed as { data: T }).data;
  }

  return parsed as T;
}

async function khGet<T>(path: string): Promise<T> {
  return khRequest<T>("GET", path);
}

async function khPost<T>(path: string, body?: unknown): Promise<T> {
  return khRequest<T>("POST", path, body);
}

async function khPatch<T>(path: string, body: unknown): Promise<T> {
  return khRequest<T>("PATCH", path, body);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Deploy a workflow to KeeperHub using the two-step create → patch pattern:
 *   1. POST /api/workflows/create  → creates a named shell, returns an ID
 *   2. PATCH /api/workflows/{id}   → pushes the full node/edge graph
 *
 * Returns a DeployResult with the workflow ID and dashboard URL on success.
 */
export async function createWorkflow(
  name: string,
  description: string,
  graph: KHWorkflowGraph
): Promise<DeployResult> {
  // const projectId = process.env.KEEPERHUB_PROJECT_ID;

  try {
    // Step 1 — create the workflow with full graph
    const createBody: Record<string, unknown> = {
      name,
      description,
      nodes: graph.nodes,
      edges: graph.edges,
      visibility: "private",
    };
    
    // if (projectId) createBody.projectId = projectId;

    const created = await khPost<KHCreateResponse>(
      "/workflows/create",
      createBody
    );

    const workflowId = created.id;
    console.log(`[KeeperHub] Deployed workflow: ${workflowId}`);

    const workflowUrl = `https://app.keeperhub.com/workflows/${workflowId}`;
    return { success: true, workflowId, workflowUrl };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[KeeperHub] Deploy failed: ${message}`);
    return { success: false, error: message };
  }
}



/**
 * List all workflows for the authenticated org (optionally scoped to a project).
 */
export async function listWorkflows(): Promise<
  Array<{ id: string; name: string; description: string }>
> {
  const projectId = process.env.KEEPERHUB_PROJECT_ID;
  const qs = projectId ? `?projectId=${projectId}` : "";

  const res = await fetch(`${BASE_URL}/workflows${qs}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error(`KeeperHub GET /workflows failed — HTTP ${res.status}`);
  }

  return res.json() as Promise<Array<{ id: string; name: string; description: string }>>;
}

/**
 * Pause a workflow (sets it to non-executing).
 * KeeperHub uses PATCH /api/workflows/{id} with a paused flag.
 */
export async function pauseWorkflow(workflowId: string): Promise<DeployResult> {
  try {
    try {
      await khPost(`/workflows/${workflowId}/pause`);
    } catch (err) {
      if (!(err instanceof KeeperHubHttpError) || err.status !== 404) throw err;
      await khPatch(`/workflows/${workflowId}`, { paused: true, enabled: false });
    }

    const workflow = await getWorkflow(workflowId);
    if (isWorkflowEnabled(workflow) === true) {
      throw new Error("KeeperHub accepted the request, but the workflow still appears enabled");
    }
    return { success: true, workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[KeeperHub] pauseWorkflow failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Resume a paused workflow.
 */
export async function resumeWorkflow(workflowId: string): Promise<DeployResult> {
  try {
    try {
      await khPost(`/workflows/${workflowId}/resume`);
    } catch (err) {
      if (!(err instanceof KeeperHubHttpError) || err.status !== 404) throw err;
      await khPatch(`/workflows/${workflowId}`, { paused: false, enabled: true });
    }

    const workflow = await getWorkflow(workflowId);
    if (isWorkflowEnabled(workflow) === false) {
      throw new Error("KeeperHub accepted the request, but the workflow still appears disabled");
    }
    return { success: true, workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[KeeperHub] resumeWorkflow failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Delete a workflow from KeeperHub.
 * Uses force=true to cascade-delete any execution history.
 */
export async function deleteWorkflow(workflowId: string): Promise<DeployResult> {
  try {
    const res = await fetch(`${BASE_URL}/workflows/${workflowId}?force=true`, {
      method: "DELETE",
      headers: getHeaders(),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errBody = (await res.json()) as KHErrorResponse;
        errMsg += `: ${errBody.error ?? errBody.message ?? res.statusText}`;
      } catch {
        errMsg += `: ${res.statusText}`;
      }
      throw new Error(`KeeperHub DELETE /workflows/${workflowId} failed — ${errMsg}`);
    }

    return { success: true, workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[KeeperHub] deleteWorkflow failed: ${message}`);
    return { success: false, error: message };
  }
}

export async function getWorkflow(
  workflowId: string
): Promise<KeeperHubWorkflowResponse> {
  return khGet<KeeperHubWorkflowResponse>(`/workflows/${workflowId}`);
}

export async function triggerWorkflow(
  workflowId: string
): Promise<DeployResult & WorkflowExecutionResult> {
  try {
    let result: WorkflowExecutionResult;
    try {
      result = await khPost<WorkflowExecutionResult>(`/workflows/${workflowId}/trigger`);
    } catch (err) {
      if (!(err instanceof KeeperHubHttpError) || err.status !== 404) throw err;
      result = await khPost<WorkflowExecutionResult>(`/workflow/${workflowId}/execute`);
    }
    return { success: true, workflowId, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[KeeperHub] triggerWorkflow failed: ${message}`);
    return { success: false, error: message };
  }
}

function isWorkflowEnabled(workflow: KeeperHubWorkflowResponse): boolean | null {
  for (const key of ["enabled", "isEnabled", "active", "isActive"]) {
    const value = workflow[key];
    if (typeof value === "boolean") return value;
  }

  const status = workflow.status;
  if (typeof status === "string") {
    const normalized = status.toLowerCase();
    if (["paused", "disabled", "inactive"].includes(normalized)) return false;
    if (["active", "enabled", "running"].includes(normalized)) return true;
  }

  const paused = workflow.paused;
  if (typeof paused === "boolean") return !paused;

  return null;
}

// ─── Execution history ────────────────────────────────────────────────────────

export interface Execution {
  id: string;
  status: "success" | "failed" | "running" | "pending";
  startedAt: string;
  finishedAt?: string;
}

/**
 * Fetch the most recent N executions for a workflow.
 * KeeperHub exposes these under GET /api/workflows/{id}/executions.
 */
export async function getExecutionHistory(
  workflowId: string,
  limit: number = 5
): Promise<Execution[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/workflows/${workflowId}/executions?limit=${limit}`,
      { method: "GET", headers: getHeaders() }
    );

    if (!res.ok) {
      console.warn(`[KeeperHub] getExecutionHistory HTTP ${res.status} — returning empty`);
      return [];
    }

    const data = (await res.json()) as Execution[];
    return Array.isArray(data) ? data.slice(0, limit) : [];
  } catch (err) {
    console.error(`[KeeperHub] getExecutionHistory error:`, err);
    return [];
  }
}
