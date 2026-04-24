"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BreakControls } from "./BreakControls";
import { Timeline, TimelineRow } from "./Timeline";
import { PatientPanel } from "./PatientPanel";
import { TerminalLog, ClientEvent } from "./TerminalLog";

const POLL_MS = 3000;
const MAX_CLIENT_EVENTS = 200;

export function DashboardClient(props: {
  initialRows: TimelineRow[];
  defaultPatientUrl: string;
}) {
  const [rows, setRows] = useState(props.initialRows);
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);
  // Pin the iframe to production until a newer signal fires. Initialized to the
  // max existing id so page load always starts on production (not an old PR preview).
  const [productionPinAfterId, setProductionPinAfterId] = useState<number | null>(
    () => {
      const max = props.initialRows.reduce((m, r) => Math.max(m, r.id), 0);
      return max > 0 ? max : null;
    }
  );

  const addEvent = useCallback((kind: "action" | "error", text: string) => {
    setClientEvents((prev) =>
      [...prev, { ts: new Date().toISOString(), kind, text }].slice(-MAX_CLIENT_EVENTS)
    );
  }, []);

  const onMergeSuccess = useCallback(() => {
    const maxId = rows.reduce((m, r) => Math.max(m, r.id), 0);
    setProductionPinAfterId(maxId);
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/signals", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { rows: TimelineRow[] };
        if (cancelled) return;
        setRows(data.rows);
      } catch {
        /* ignore transient */
      }
    }
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Auto-switch iframe to the most recent open-PR preview when one exists,
  // unless we're pinned to production (e.g. just after a merge).
  const { patientUrl, patientLabel } = useMemo(() => {
    const open = rows.find(
      (r) =>
        r.pr_number &&
        !r.merged_at &&
        r.preview_url &&
        (productionPinAfterId == null || r.id > productionPinAfterId)
    );
    if (open && open.preview_url) {
      const host = previewPatientHost(open.preview_url);
      if (host) {
        return {
          patientUrl: `https://${host}`,
          patientLabel: `PR #${open.pr_number} preview`,
        };
      }
    }
    return {
      patientUrl: props.defaultPatientUrl,
      patientLabel: "production",
    };
  }, [rows, props.defaultPatientUrl, productionPinAfterId]);

  return (
    <>
      <div className="topbar">
        <div className="brand">Autoheal</div>
        <div className="brand-railway" aria-label="Railway">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="var(--railway)" />
            <path
              d="M9 13.5h14M10.5 17h11M12 20.5h8"
              stroke="#0b0b0f"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          <span>Railway</span>
        </div>
      </div>
      <div className="layout">
        <div className="panel">
          <h2>Break it</h2>
          <BreakControls onEvent={addEvent} />
        </div>
        <PatientPanel url={patientUrl} label={patientLabel} />
        <div className="panel">
          <h2>PRs</h2>
          <Timeline rows={rows} onEvent={addEvent} onMergeSuccess={onMergeSuccess} />
        </div>
      </div>
      <TerminalLog rows={rows} clientEvents={clientEvents} />
    </>
  );
}

function previewPatientHost(dashboardPreviewUrl: string): string | null {
  try {
    const u = new URL(dashboardPreviewUrl);
    const m = u.host.match(/^dashboard-web-(.+)$/);
    return m ? `patient-web-${m[1]}` : u.host;
  } catch {
    return null;
  }
}
