import { query } from "../src/db";
import type { SignalRow, PullRequestRow, TranscriptRow } from "../src/types";
import { BreakControls } from "./BreakControls";
import { Timeline } from "./Timeline";

export const dynamic = "force-dynamic";

interface TimelineRow extends SignalRow {
  pr_number: number | null;
  branch: string | null;
  preview_url: string | null;
  services_rebuilt: string[] | null;
  services_skipped: string[] | null;
  build_ms: number | null;
  merged_at: Date | null;
  transcript_commands: TranscriptRow["commands"] | null;
}

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
  const patientUrl = process.env.PATIENT_WEB_URL ?? "http://localhost:3001";
  const [rows, railwayCount] = await Promise.all([
    loadTimeline().catch(() => [] as TimelineRow[]),
    loadRailwayCommandCount().catch(() => 0),
  ]);

  return (
    <>
      <div className="topbar">
        <div className="brand">Autoheal</div>
        <div className="counter">
          Railway commands executed by agents: <strong>{railwayCount}</strong>
        </div>
      </div>
      <div className="layout">
        <div className="panel">
          <h2>Break it</h2>
          <BreakControls />
        </div>
        <div className="panel" style={{ padding: 0 }}>
          <iframe className="patient-frame" src={patientUrl} title="Patient" />
        </div>
        <div className="panel">
          <h2>Timeline</h2>
          <Timeline rows={rows} />
        </div>
      </div>
    </>
  );
}
