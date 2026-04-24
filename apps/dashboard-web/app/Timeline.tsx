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
  transcript_reasoning: string | null;
}

const STAGES: Array<{ status: string; label: string }> = [
  { status: "pending", label: "queued" },
  { status: "classifying", label: "classifying" },
  { status: "healing", label: "healing" },
  { status: "pr_open", label: "PR open" },
  { status: "merged", label: "merged" },
];

function stageIndex(status: string): number {
  const i = STAGES.findIndex((s) => s.status === status);
  return i === -1 ? 0 : i;
}

export function Timeline({
  rows,
  onEvent,
}: {
  rows: TimelineRow[];
  onEvent?: (kind: "action" | "error", text: string) => void;
}) {
  if (rows.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No signals yet. Trigger one from the left.</p>;
  }
  return (
    <>
      {rows.map((r) => (
        <TimelineEntry key={r.id} row={r} onEvent={onEvent} />
      ))}
    </>
  );
}

function TimelineEntry({
  row,
  onEvent,
}: {
  row: TimelineRow;
  onEvent?: (kind: "action" | "error", text: string) => void;
}) {
  const [merging, setMerging] = useState(false);

  async function merge() {
    if (!row.pr_number) return;
    setMerging(true);
    onEvent?.("action", `merge PR #${row.pr_number}`);
    try {
      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pr_number: row.pr_number }),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.ok) {
        onEvent?.("action", `PR #${row.pr_number} ${j.message ?? "merged"}`);
      } else {
        onEvent?.("error", `merge PR #${row.pr_number} failed: ${j.error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      onEvent?.("error", `merge PR #${row.pr_number} failed: ${(err as Error).message}`);
    } finally {
      setMerging(false);
    }
  }

  const title = describeSignal(row);
  const isTerminal = row.status === "merged" || row.status === "ignored" || row.status === "failed";
  const currentStageIdx = stageIndex(row.status);
  const railwayCmdCount =
    row.transcript_commands?.filter((c) => c.command.startsWith("railway")).length ?? 0;

  return (
    <div className="timeline-entry">
      <div className="timeline-header">
        <span className="timeline-source">{row.source}</span>
        <span className="timeline-source">{new Date(row.created_at).toLocaleTimeString()}</span>
      </div>
      <div className="timeline-title">{title}</div>

      <div className="stage-track">
        {STAGES.map((s, i) => {
          const done = i < currentStageIdx;
          const active = i === currentStageIdx && !isTerminal;
          const reached = i <= currentStageIdx;
          return (
            <div
              key={s.status}
              className={`stage ${done ? "done" : ""} ${active ? "active" : ""} ${reached ? "reached" : ""}`}
              title={s.label}
            >
              <span className="stage-dot" />
              <span className="stage-label">{s.label}</span>
            </div>
          );
        })}
      </div>

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
            preview ↗
          </a>
        )}
        {row.build_ms != null && <span className="pill">build {(row.build_ms / 1000).toFixed(1)}s</span>}
        {row.services_rebuilt && row.services_rebuilt.length > 0 && (
          <span className="pill railway" title={row.services_rebuilt.join(", ")}>
            rebuilt {row.services_rebuilt.length}
          </span>
        )}
        {row.services_skipped && row.services_skipped.length > 0 && (
          <span className="pill" title={row.services_skipped.join(", ")}>
            skipped {row.services_skipped.length}
          </span>
        )}
        {railwayCmdCount > 0 && (
          <span className="pill railway">railway {railwayCmdCount}</span>
        )}
        {row.merged_at && <span className="pill ok">merged</span>}
      </div>

      {row.pr_number && !row.merged_at && (
        <div style={{ marginTop: 10 }}>
          <button className="primary" onClick={merge} disabled={merging}>
            {merging ? "merging…" : "merge"}
          </button>
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
    case "synthetic.failure_rate": return "patient-web /api/status returning 5xx";
    case "railway.logs": return "Error spike in Railway logs";
    case "railway.deployment": return "Deployment failed";
    case "github.workflow": return "GitHub workflow failed";
    case "posthog.alert": return "PostHog alert";
    default: return row.source;
  }
}
