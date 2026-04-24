import { getPool, query } from "./db.js";
import type { SignalRow, TranscriptCommand } from "./types.js";
import { classify } from "./classify.js";
import { runAgentInSandbox } from "./agent.js";
import { prepareSandbox, applyAndPush, cleanupSandbox } from "./sandbox.js";
import { openPullRequest } from "./github.js";

const INTERVAL_MS = Number(process.env.HEAL_INTERVAL_MS ?? 3000);
const MAX_PARALLEL = 1;

async function claim(): Promise<SignalRow | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `SELECT * FROM signals
       WHERE status = 'pending'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    if (res.rowCount === 0) {
      await client.query("COMMIT");
      return null;
    }
    const row = res.rows[0] as SignalRow;
    await client.query(
      `UPDATE signals SET status = 'claimed', claimed_at = now() WHERE id = $1`,
      [row.id]
    );
    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateStatus(
  id: number,
  status: string,
  classification?: string | null
): Promise<void> {
  if (classification !== undefined) {
    await query(
      `UPDATE signals SET status = $1, classification = $2 WHERE id = $3`,
      [status, classification, id]
    );
  } else {
    await query(`UPDATE signals SET status = $1 WHERE id = $2`, [status, id]);
  }
}

async function saveTranscript(
  signalId: number,
  commands: TranscriptCommand[],
  diff: string | null,
  reasoning: string | null
): Promise<void> {
  await query(
    `INSERT INTO transcripts (signal_id, commands, diff, reasoning)
     VALUES ($1, $2::jsonb, $3, $4)`,
    [signalId, JSON.stringify(commands), diff, reasoning]
  );
}

async function handle(signal: SignalRow): Promise<void> {
  const tag = `[healer/${signal.id}]`;
  console.log(`${tag} handling source=${signal.source}`);
  let cls: Awaited<ReturnType<typeof classify>> | null = null;
  let sandbox: Awaited<ReturnType<typeof prepareSandbox>> | null = null;

  try {
    await updateStatus(signal.id, "classifying");
    cls = await classify(signal);
    console.log(`${tag} classified=${cls}`);

    if (cls === "ignore") {
      await query(
        `UPDATE signals SET status = 'ignored', classification = 'ignore', resolved_at = now() WHERE id = $1`,
        [signal.id]
      );
      return;
    }

    await updateStatus(signal.id, "healing", cls);

    console.log(`${tag} preparing sandbox`);
    sandbox = await prepareSandbox();
    console.log(`${tag} sandbox ready at ${sandbox.dir}`);

    console.log(`${tag} invoking agent`);
    const agentResult = await runAgentInSandbox({
      cwd: sandbox.dir,
      signal,
    });
    console.log(`${tag} agent done commands=${agentResult.commands.length} diff=${agentResult.diff.length}b`);

    if (!agentResult.diff || agentResult.diff.trim().length === 0) {
      await saveTranscript(signal.id, agentResult.commands, null, agentResult.reasoning);
      await updateStatus(signal.id, "failed", cls);
      console.log(`${tag} produced no diff`);
      return;
    }

    const branch = `autoheal/signal-${signal.id}`;
    console.log(`${tag} pushing branch=${branch}`);
    await applyAndPush(sandbox, {
      branch,
      commitMessage: `autoheal: ${truncate(describeSignal(signal), 60)}`,
      diff: agentResult.diff,
    });

    console.log(`${tag} opening PR`);
    const pr = await openPullRequest({
      branch,
      title: `autoheal: ${describeSignal(signal)}`,
      body: buildPrBody(signal, agentResult.reasoning),
    });

    await query(
      `INSERT INTO pull_requests (signal_id, github_pr_number, branch)
       VALUES ($1, $2, $3)`,
      [signal.id, pr.number, branch]
    );
    await saveTranscript(signal.id, agentResult.commands, agentResult.diff, agentResult.reasoning);
    await updateStatus(signal.id, "pr_open", cls);
    console.log(`${tag} PR #${pr.number} opened`);
  } catch (err) {
    console.error(`${tag} failed`, err);
    try {
      await updateStatus(signal.id, "failed", cls ?? null);
    } catch (updateErr) {
      console.error(`${tag} could not update status to failed`, updateErr);
    }
  } finally {
    if (sandbox) {
      await cleanupSandbox(sandbox).catch((err) =>
        console.error(`${tag} cleanup failed`, err)
      );
    }
  }
}

function describeSignal(signal: SignalRow): string {
  const p = signal.payload as { title?: string; summary?: string };
  return p.title ?? p.summary ?? `signal ${signal.id}`;
}

function buildPrBody(signal: SignalRow, reasoning: string | null): string {
  const p = signal.payload as { title?: string; summary?: string };
  return [
    `Signal #${signal.id} — ${signal.source}`,
    "",
    p.summary ?? p.title ?? "",
    "",
    reasoning ? `---\n**Agent reasoning**\n\n${reasoning}` : "",
  ]
    .join("\n")
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

async function diagnoseAgentBinary(): Promise<void> {
  const { execFile: ef } = await import("node:child_process");
  const { promisify: p } = await import("node:util");
  const run = p(ef);
  const cliPath = new URL("../node_modules/@anthropic-ai/claude-agent-sdk/cli.js", import.meta.url).pathname;
  try {
    const { stdout, stderr } = await run("node", [cliPath, "--version"], { timeout: 30_000 });
    console.log(`[diag] cli --version stdout=${stdout.trim()} stderr=${stderr.trim()}`);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    console.log(`[diag] cli --version FAILED code=${e.code} msg=${e.message}`);
    console.log(`[diag] stdout=${(e.stdout ?? "").slice(0, 2000)}`);
    console.log(`[diag] stderr=${(e.stderr ?? "").slice(0, 2000)}`);
  }

  // Real query test — tests that auth + streaming + tooling all work
  try {
    const { stdout, stderr } = await run(
      "node",
      [cliPath, "-p", "Reply with the single word: pong", "--output-format", "text"],
      {
        timeout: 60_000,
        env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "" },
        maxBuffer: 4 * 1024 * 1024,
      }
    );
    console.log(`[diag] cli query stdout=${stdout.trim().slice(0, 500)}`);
    console.log(`[diag] cli query stderr=${stderr.trim().slice(0, 500)}`);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    console.log(`[diag] cli query FAILED code=${e.code} msg=${e.message}`);
    console.log(`[diag] query stdout=${(e.stdout ?? "").slice(0, 2000)}`);
    console.log(`[diag] query stderr=${(e.stderr ?? "").slice(0, 2000)}`);
  }
}

async function main(): Promise<void> {
  console.log("[healer] starting");
  await getPool().query("SELECT 1");
  console.log("[healer] db connected");
  await diagnoseAgentBinary();

  const inFlight = new Set<Promise<void>>();
  while (true) {
    if (inFlight.size >= MAX_PARALLEL) {
      await Promise.race(inFlight);
      continue;
    }
    const signal = await claim().catch((err) => {
      console.error("[healer] claim error", err);
      return null;
    });
    if (!signal) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }
    const p = handle(signal).finally(() => inFlight.delete(p));
    inFlight.add(p);
  }
}

main().catch((err) => {
  console.error("[healer] fatal", err);
  process.exit(1);
});
