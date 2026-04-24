import { query } from "../src/db";
import { DashboardClient } from "./DashboardClient";
import type { TimelineRow } from "./Timeline";

export const dynamic = "force-dynamic";

async function loadTimeline(): Promise<TimelineRow[]> {
  return query<TimelineRow>(
    `SELECT s.*,
            pr.github_pr_number  AS pr_number,
            pr.branch            AS branch,
            pr.preview_url       AS preview_url,
            pr.services_rebuilt  AS services_rebuilt,
            pr.services_skipped  AS services_skipped,
            pr.build_ms          AS build_ms,
            pr.merged_at         AS merged_at,
            t.commands           AS transcript_commands
     FROM signals s
     LEFT JOIN pull_requests pr ON pr.signal_id = s.id
     LEFT JOIN LATERAL (
       SELECT commands FROM transcripts WHERE signal_id = s.id
       ORDER BY created_at DESC LIMIT 1
     ) t ON true
     ORDER BY s.created_at DESC
     LIMIT 50`
  );
}

async function loadRailwayCommandCount(): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT COALESCE(SUM(
       (SELECT COUNT(*) FROM jsonb_array_elements(commands) c
        WHERE c->>'command' LIKE 'railway%')
     ), 0)::text AS n
     FROM transcripts`
  );
  return Number(rows[0]?.n ?? 0);
}

export default async function HomePage() {
  const defaultPatientUrl = process.env.PATIENT_WEB_URL ?? "http://localhost:3001";
  const [rows, railwayCount] = await Promise.all([
    loadTimeline().catch(() => [] as TimelineRow[]),
    loadRailwayCommandCount().catch(() => 0),
  ]);

  return (
    <DashboardClient
      initialRows={rows}
      initialRailwayCount={railwayCount}
      defaultPatientUrl={defaultPatientUrl}
    />
  );
}
