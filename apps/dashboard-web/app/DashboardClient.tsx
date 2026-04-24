"use client";

import { useEffect, useState } from "react";
import { BreakControls } from "./BreakControls";
import { Timeline, TimelineRow } from "./Timeline";
import { PatientPanel } from "./PatientPanel";

const POLL_MS = 3000;

export function DashboardClient(props: {
  initialRows: TimelineRow[];
  initialRailwayCount: number;
  defaultPatientUrl: string;
}) {
  const [rows, setRows] = useState(props.initialRows);
  const [railwayCount, setRailwayCount] = useState(props.initialRailwayCount);
  const [patientUrl, setPatientUrl] = useState(props.defaultPatientUrl);
  const [patientLabel, setPatientLabel] = useState<string>("production");

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

  function viewPatientAt(url: string, label: string) {
    setPatientUrl(url);
    setPatientLabel(label);
  }

  function resetPatient() {
    setPatientUrl(props.defaultPatientUrl);
    setPatientLabel("production");
  }

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
        <PatientPanel
          url={patientUrl}
          label={patientLabel}
          onReset={resetPatient}
          isDefault={patientUrl === props.defaultPatientUrl}
        />
        <div className="panel">
          <h2>Timeline</h2>
          <Timeline rows={rows} onViewPatient={viewPatientAt} />
        </div>
      </div>
    </>
  );
}
