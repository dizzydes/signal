"use client";

import { useCallback, useEffect, useState } from "react";
import { BreakControls } from "./BreakControls";
import { Timeline, TimelineRow } from "./Timeline";
import { PatientPanel } from "./PatientPanel";
import { TerminalLog, ClientEvent } from "./TerminalLog";

const POLL_MS = 3000;
const MAX_CLIENT_EVENTS = 200;

export function DashboardClient(props: {
  initialRows: TimelineRow[];
  initialRailwayCount: number;
  defaultPatientUrl: string;
}) {
  const [rows, setRows] = useState(props.initialRows);
  const [railwayCount, setRailwayCount] = useState(props.initialRailwayCount);
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);

  const addEvent = useCallback((kind: "action" | "error", text: string) => {
    setClientEvents((prev) =>
      [...prev, { ts: new Date().toISOString(), kind, text }].slice(-MAX_CLIENT_EVENTS)
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/signals", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          rows: TimelineRow[];
          railwayCommandCount: number;
        };
        if (cancelled) return;
        setRows(data.rows);
        setRailwayCount(data.railwayCommandCount);
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
          <BreakControls onEvent={addEvent} />
        </div>
        <PatientPanel url={props.defaultPatientUrl} />
        <div className="panel">
          <h2>Signals</h2>
          <Timeline rows={rows} onEvent={addEvent} />
        </div>
      </div>
      <TerminalLog rows={rows} clientEvents={clientEvents} />
    </>
  );
}
