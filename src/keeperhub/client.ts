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
