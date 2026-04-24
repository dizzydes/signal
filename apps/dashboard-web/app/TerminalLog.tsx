"use client";

import { useEffect, useRef } from "react";
import type { TimelineRow } from "./Timeline";

export interface ClientEvent {
  ts: string;
  kind: "action" | "error";
  text: string;
}

interface LogLine {
  ts: string;
  kind: "action" | "signal" | "decision" | "stage" | "cmd" | "railway-cmd" | "gh-cmd" | "git-cmd" | "pr" | "preview" | "merge" | "error";
  text: string;
}

function rowsToLines(rows: TimelineRow[]): LogLine[] {
  const out: LogLine[] = [];
  for (const r of rows) {
    const id = `#${r.id}`;
    const createdAt = new Date(r.created_at).toISOString();
    out.push({
      ts: createdAt,
      kind: "signal",
      text: `${id} signal fired  source=${r.source}  ${describeSignal(r).slice(0, 80)}`,
    });
    if (r.classification) {
      out.push({
        ts: r.claimed_at ? new Date(r.claimed_at).toISOString() : createdAt,
        kind: "decision",
        text: `${id} classified  → ${r.classification}`,
      });
    }
    if (r.transcript_commands && r.transcript_commands.length > 0) {
      for (const c of r.transcript_commands) {
        const prefix = c.command.split(/\s+/)[0];
        const kind: LogLine["kind"] =
          prefix === "railway" ? "railway-cmd" : prefix === "gh" ? "gh-cmd" : prefix === "git" ? "git-cmd" : "cmd";
        out.push({
          ts: c.started_at || createdAt,
          kind,
          text: `${id} $ ${c.command.length > 140 ? c.command.slice(0, 140) + "…" : c.command}`,
        });
      }
    }
    if (r.pr_number) {
      out.push({
        ts: createdAt,
        kind: "pr",
        text: `${id} PR #${r.pr_number} opened  branch=${r.branch ?? "?"}`,
      });
    }
    if (r.preview_url) {
      const rebuilt = r.services_rebuilt?.length ?? 0;
      const skipped = r.services_skipped?.length ?? 0;
      const ms = r.build_ms ? `${(r.build_ms / 1000).toFixed(1)}s` : "?";
      out.push({
        ts: createdAt,
        kind: "preview",
        text: `${id} preview env ready  ${r.preview_url}  rebuilt=${rebuilt} skipped=${skipped} build=${ms}`,
      });
    }
    if (r.merged_at) {
      out.push({
        ts: new Date(r.merged_at).toISOString(),
        kind: "merge",
        text: `${id} PR #${r.pr_number} merged ✓`,
      });
    }
  }
  return out;
}

function classFor(k: LogLine["kind"]): string {
  switch (k) {
    case "signal": return "log-signal";
    case "decision": return "log-decision";
    case "stage": return "log-stage";
    case "action": return "log-action";
    case "railway-cmd": return "log-railway";
    case "gh-cmd": return "log-gh";
    case "git-cmd": return "log-git";
    case "cmd": return "log-cmd";
    case "pr": return "log-pr";
    case "preview": return "log-railway";
    case "merge": return "log-ok";
    case "error": return "log-err";
  }
}

function prefix(k: LogLine["kind"]): string {
  switch (k) {
    case "action": return "▸";
    case "signal": return "●";
    case "decision": return "→";
    case "stage": return "·";
    case "pr": return "↗";
    case "preview": return "◆";
    case "merge": return "✓";
    case "railway-cmd": return "$";
    case "gh-cmd": return "$";
    case "git-cmd": return "$";
    case "cmd": return "$";
    case "error": return "✗";
  }
}

export function TerminalLog(props: {
  rows: TimelineRow[];
  clientEvents: ClientEvent[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lines: LogLine[] = [
    ...rowsToLines(props.rows),
    ...props.clientEvents.map<LogLine>((e) => ({ ts: e.ts, kind: e.kind, text: e.text })),
  ].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);

  return (
    <div className="terminal-log" ref={ref}>
      {lines.length === 0 ? (
        <div className="log-muted">waiting for activity…</div>
      ) : (
        lines.map((l, i) => (
          <div key={i} className={`log-line ${classFor(l.kind)}`}>
            <span className="log-ts">{new Date(l.ts).toLocaleTimeString()}</span>
            <span className="log-prefix">{prefix(l.kind)}</span>
            <span className="log-text">{l.text}</span>
          </div>
        ))
      )}
    </div>
  );
}

function describeSignal(row: TimelineRow): string {
  const p = row.payload as { title?: string; summary?: string } | undefined;
  if (p?.title) return p.title;
  if (p?.summary) return p.summary;
  return row.source;
}
