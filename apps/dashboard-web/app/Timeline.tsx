"use client";

import { useState } from "react";
import type { SignalRow, TranscriptCommand } from "../src/types";

export interface TimelineRow extends SignalRow {
  pr_number: number | null;
  branch: string | null;
  preview_url: string | null;
  services_rebuilt: string[] | null;
  services_skipped: string[] | null;
  build_ms: number | null;
  merged_at: Date | null;
  transcript_commands: TranscriptCommand[] | null;
}

function cmdClass(command: string): string {
  if (command.startsWith("railway")) return "cmd railway";
  if (command.startsWith("gh ")) return "cmd gh";
  if (command.startsWith("git ")) return "cmd git";
  return "cmd";
}

export function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No signals yet. Trigger one from the left.</p>;
  }
  return (
    <>
      {rows.map((r) => (
        <TimelineEntry key={r.id} row={r} />
      ))}
    </>
  );
}

function TimelineEntry({ row }: { row: TimelineRow }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [merging, setMerging] = useState(false);

  async function merge() {
    if (!row.pr_number) return;
    setMerging(true);
    await fetch("/api/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr_number: row.pr_number }),
    });
    setMerging(false);
  }

  const title = describeSignal(row);
  const hasTranscript = Array.isArray(row.transcript_commands) && row.transcript_commands.length > 0;

  return (
    <div className="timeline-entry">
      <div className="timeline-header">
        <span className="timeline-source">{row.source}</span>
        <span className="timeline-source">{new Date(row.created_at).toLocaleTimeString()}</span>
      </div>
      <div className="timeline-title">{title}</div>
      <div className="timeline-meta">
        <span className={`pill ${statusClass(row.status)}`}>{row.status}</span>
        {row.classification && <span className="pill">{row.classification}</span>}
        {row.pr_number && (
          <a
            className="pill"
            href={`https://github.com/dizzydes/signal/pull/${row.pr_number}`}
            target="_blank"
            rel="noreferrer"
          >
            PR #{row.pr_number}
          </a>
        )}
        {row.preview_url && (
          <a className="pill railway" href={row.preview_url} target="_blank" rel="noreferrer">
            preview
          </a>
        )}
        {row.build_ms != null && <span className="pill">build {(row.build_ms / 1000).toFixed(1)}s</span>}
        {row.services_rebuilt && row.services_rebuilt.length > 0 && (
          <span className="pill railway">rebuilt {row.services_rebuilt.length}</span>
        )}
        {row.services_skipped && row.services_skipped.length > 0 && (
          <span className="pill">skipped {row.services_skipped.length}</span>
        )}
        {row.merged_at && <span className="pill ok">merged</span>}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        {hasTranscript && (
          <button onClick={() => setShowTranscript((s) => !s)}>
            {showTranscript ? "Hide" : "Show"} transcript
          </button>
        )}
        {row.pr_number && !row.merged_at && (
          <button className="primary" onClick={merge} disabled={merging}>
            {merging ? "Merging…" : "Merge"}
          </button>
        )}
      </div>

      {showTranscript && hasTranscript && (
        <div className="transcript">
          {row.transcript_commands!.map((c, i) => (
            <div key={i}>
              <div className={cmdClass(c.command)}>$ {c.command}</div>
              {c.stdout && <div className="out">{c.stdout.slice(0, 800)}</div>}
              {c.stderr && <div className="out" style={{ color: "var(--err)" }}>{c.stderr.slice(0, 800)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusClass(s: string): string {
  if (s === "merged" || s === "pr_open") return "ok";
  if (s === "failed") return "err";
  return "";
}

function describeSignal(row: TimelineRow): string {
  const p = row.payload as { title?: string; summary?: string } | undefined;
  if (p?.title) return p.title;
  if (p?.summary) return p.summary;
  switch (row.source) {
    case "synthetic.typo": return "Typo on landing page: 'Sigup'";
    case "railway.logs": return "Error spike in Railway logs";
    case "railway.deployment": return "Deployment failed";
    case "github.workflow": return "GitHub workflow failed";
    case "posthog.alert": return "PostHog alert";
    default: return row.source;
  }
}
