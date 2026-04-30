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
  error?: string;
  message?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://keeperhub.com/api";

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

async function khPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as KHErrorResponse;
      errMsg += `: ${errBody.error ?? errBody.message ?? res.statusText}`;
    } catch {
      errMsg += `: ${res.statusText}`;
    }
    throw new Error(`KeeperHub POST ${path} failed — ${errMsg}`);
  }

  return res.json() as Promise<T>;
}

async function khPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as KHErrorResponse;
      errMsg += `: ${errBody.error ?? errBody.message ?? res.statusText}`;
    } catch {
      errMsg += `: ${res.statusText}`;
    }
    throw new Error(`KeeperHub PATCH ${path} failed — ${errMsg}`);
  }

  return res.json() as Promise<T>;
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
  const projectId = process.env.KEEPERHUB_PROJECT_ID;

  try {
    // Step 1 — create the workflow shell
    const createBody: Record<string, unknown> = { name, description };
    if (projectId) createBody.projectId = projectId;

    const created = await khPost<KHCreateResponse>(
      "/workflows/create",
      createBody
    );

    const workflowId = created.id;
    console.log(`[KeeperHub] Created shell workflow: ${workflowId}`);

    // Step 2 — push the full node/edge graph
    await khPatch(`/workflows/${workflowId}`, {
      name,
      description,
      ...(projectId ? { projectId } : {}),
      nodes: graph.nodes,
      edges: graph.edges,
      visibility: "private",
    });

    console.log(`[KeeperHub] Patched workflow graph: ${workflowId}`);

    const workflowUrl = `https://keeperhub.com/workflows/${workflowId}`;
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
    await khPatch(`/workflows/${workflowId}`, { paused: true });
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
    await khPatch(`/workflows/${workflowId}`, { paused: false });
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
