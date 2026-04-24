import { query } from "./db.js";

const ENDPOINT = "https://backboard.railway.com/graphql/v2";

function railwayToken(): string {
  const t = process.env.RAILWAY_API_TOKEN;
  if (!t) throw new Error("RAILWAY_API_TOKEN is not set");
  return t;
}

async function gql<T>(q: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "project-access-token": railwayToken(),
    },
    body: JSON.stringify({ query: q, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || body.errors) {
    throw new Error(`Railway GQL: ${body.errors?.map((e) => e.message).join(", ") ?? res.statusText}`);
  }
  return body.data as T;
}

interface DeploymentEdge {
  node: {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    meta: Record<string, unknown> | null;
    service: { id: string; name: string } | null;
  };
}

export async function pollRailwayDeployments(): Promise<void> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const environmentId = process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID;
  if (!projectId || !environmentId) return;

  const data = await gql<{ deployments: { edges: DeploymentEdge[] } }>(
    `query RecentDeployments($input: DeploymentListInput!) {
       deployments(input: $input, first: 20) {
         edges { node {
           id status createdAt updatedAt meta
           service { id name }
         } }
       }
     }`,
    { input: { projectId, environmentId } }
  );

  for (const edge of data.deployments.edges) {
    const d = edge.node;
    if (d.status !== "FAILED" && d.status !== "CRASHED") continue;

    const exists = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM signals
       WHERE source = 'railway.deployment'
         AND payload->>'deployment_id' = $1`,
      [d.id]
    );
    if (Number(exists[0].count) > 0) continue;

    await query(
      `INSERT INTO signals (source, payload, status)
       VALUES ('railway.deployment', $1::jsonb, 'pending')`,
      [
        JSON.stringify({
          deployment_id: d.id,
          status: d.status,
          service_id: d.service?.id,
          service_name: d.service?.name,
          title: `Deployment ${d.status.toLowerCase()} on ${d.service?.name ?? "unknown"}`,
          meta: d.meta,
        }),
      ]
    );
    console.log(`[poller/railway] filed signal for deployment ${d.id} status=${d.status}`);
  }
}

interface PrEnvNode {
  id: string;
  name: string;
  meta: { prNumber?: number; branch?: string } | null;
}

interface ServiceInstanceEdge {
  node: {
    serviceId: string;
    serviceName: string;
    latestDeployment: {
      status: string;
      createdAt: string;
      updatedAt: string;
    } | null;
    domains: {
      serviceDomains: { domain: string }[];
      customDomains: { domain: string }[];
    };
  };
}

export async function attachPreviewUrls(): Promise<void> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  if (!projectId) return;

  const openPrs = await query<{ github_pr_number: number }>(
    `SELECT github_pr_number FROM pull_requests
     WHERE preview_url IS NULL AND merged_at IS NULL`
  );
  if (openPrs.length === 0) return;

  const envsData = await gql<{ environments: { edges: Array<{ node: PrEnvNode }> } }>(
    `query PrEnvs($projectId: String!) {
       environments(projectId: $projectId, isEphemeral: true, first: 100) {
         edges { node { id name meta { prNumber branch } } }
       }
     }`,
    { projectId }
  );
  const prEnvs = new Map<number, PrEnvNode>();
  for (const e of envsData.environments.edges) {
    const n = e.node.meta?.prNumber;
    if (typeof n === "number") prEnvs.set(n, e.node);
  }

  const projectData = await gql<{
    project: { environments: { edges: Array<{ node: { id: string; serviceInstances: { edges: ServiceInstanceEdge[] } } }> } };
  }>(
    `query ProjectEnvs($projectId: String!) {
       project(id: $projectId) {
         environments { edges { node {
           id
           serviceInstances { edges { node {
             serviceId serviceName
             latestDeployment { status createdAt updatedAt }
             domains {
               serviceDomains { domain }
               customDomains  { domain }
             }
           } } }
         } } }
       }
     }`,
    { projectId }
  );

  const envById = new Map<string, ServiceInstanceEdge[]>();
  for (const e of projectData.project.environments.edges) {
    envById.set(e.node.id, e.node.serviceInstances.edges);
  }

  for (const { github_pr_number } of openPrs) {
    const env = prEnvs.get(github_pr_number);
    if (!env) continue;
    const instances = envById.get(env.id) ?? [];
    if (instances.length === 0) continue;

    const dashboard = instances.find((s) => s.node.serviceName === "dashboard-web");
    const domainHost = dashboard?.node.domains.serviceDomains[0]?.domain
      ?? instances.flatMap((s) => s.node.domains.serviceDomains).map((d) => d.domain)[0];
    const previewUrl = domainHost ? `https://${domainHost}` : null;

    const rebuilt: string[] = [];
    const skipped: string[] = [];
    let earliest = Infinity;
    let latest = 0;
    for (const s of instances) {
      const st = s.node.latestDeployment?.status;
      if (st === "SKIPPED") skipped.push(s.node.serviceName);
      else if (st) rebuilt.push(s.node.serviceName);
      if (s.node.latestDeployment) {
        earliest = Math.min(earliest, Date.parse(s.node.latestDeployment.createdAt));
        latest = Math.max(latest, Date.parse(s.node.latestDeployment.updatedAt));
      }
    }
    const buildMs = earliest !== Infinity && latest > 0 ? latest - earliest : null;

    await query(
      `UPDATE pull_requests
       SET preview_url = $1,
           services_rebuilt = $2,
           services_skipped = $3,
           build_ms = $4
       WHERE github_pr_number = $5`,
      [previewUrl, rebuilt, skipped, buildMs, github_pr_number]
    );
    console.log(`[poller/railway] PR #${github_pr_number} preview=${previewUrl} rebuilt=${rebuilt.length} skipped=${skipped.length}`);
  }
}
