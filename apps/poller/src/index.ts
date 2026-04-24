import { getPool } from "./db.js";
import { pollRailwayDeployments, attachPreviewUrls } from "./railway.js";
import { pollGithubPrs } from "./github.js";
import { pollPosthog } from "./posthog.js";

const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);

async function tick(): Promise<void> {
  const started = Date.now();
  const results = await Promise.allSettled([
    pollRailwayDeployments(),
    attachPreviewUrls(),
    pollGithubPrs(),
    pollPosthog(),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[poller] task ${i} failed`, r.reason);
    }
  });
  console.log(`[poller] tick ${Date.now() - started}ms`);
}

async function main(): Promise<void> {
  console.log("[poller] starting");
  const pool = getPool();
  await pool.query("SELECT 1");
  console.log("[poller] db connected");

  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error("[poller] tick errored", err);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[poller] fatal", err);
  process.exit(1);
});
