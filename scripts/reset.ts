import { Client } from "pg";

const GITHUB_API = "https://api.github.com";
const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

const PATIENT_FILES = [
  "apps/patient-web/src/index.ts",
  "apps/patient-web/package.json",
];

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function ghFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function rwFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env("RAILWAY_API_TOKEN")}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || body.errors) {
    throw new Error(`Railway GQL: ${body.errors?.map((e) => e.message).join(", ") ?? res.statusText}`);
  }
  return body.data as T;
}

async function restoreFileFromTag(owner: string, repo: string, tag: string, path: string): Promise<void> {
  const source = await ghFetch<{ content: string; encoding: string }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${tag}`
  );
  const sourceBuf = Buffer.from(source.content, source.encoding as BufferEncoding);

  const current = await ghFetch<{ sha: string; content: string; encoding: string }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=main`
  );
  const currentBuf = Buffer.from(current.content, current.encoding as BufferEncoding);

  if (sourceBuf.equals(currentBuf)) {
    console.log(`[reset] ${path} already matches ${tag}`);
    return;
  }

  await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `reset: restore ${path} from ${tag}`,
      content: sourceBuf.toString("base64"),
      sha: current.sha,
      branch: "main",
    }),
  });
  console.log(`[reset] restored ${path} from ${tag}`);
}

async function resetFailureRate(): Promise<void> {
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const environmentId = process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID;
  const serviceId = process.env.RAILWAY_PATIENT_WEB_SERVICE_ID;
  if (!projectId || !environmentId || !serviceId) {
    console.log("[reset] RAILWAY_* not set, skipping FAILURE_RATE reset");
    return;
  }
  await rwFetch(
    `mutation SetVar($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    { input: { projectId, environmentId, serviceId, name: "FAILURE_RATE", value: "0" } }
  );
  console.log("[reset] FAILURE_RATE=0 on patient-web");
}

async function clearSignals(minutes: number): Promise<void> {
  const url = env("DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query<{ n: string }>(
      `WITH deleted AS (
         DELETE FROM signals WHERE created_at < now() - ($1 || ' minutes')::interval RETURNING id
       ) SELECT COUNT(*)::text AS n FROM deleted`,
      [String(minutes)]
    );
    console.log(`[reset] cleared ${r.rows[0].n} signals older than ${minutes}m`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const owner = env("GITHUB_OWNER", "dizzydes");
  const repo = env("GITHUB_REPO", "signal");
  const tag = process.env.DEMO_BASE_TAG ?? "demo-base";
  const minutes = Number(process.env.RESET_SIGNAL_MINUTES ?? 30);

  for (const path of PATIENT_FILES) {
    await restoreFileFromTag(owner, repo, tag, path).catch((err) => {
      console.error(`[reset] failed to restore ${path}:`, err.message);
    });
  }
  await resetFailureRate().catch((err) => console.error("[reset] failure-rate:", err.message));
  await clearSignals(minutes).catch((err) => console.error("[reset] clear-signals:", err.message));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reset] fatal", err);
    process.exit(1);
  });
