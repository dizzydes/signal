"use client";

import { useEffect, useState } from "react";

// After switching to a PR preview, Railway's deployment may report SUCCESS a few
// seconds before the container is actually serving traffic. Schedule a couple of
// reloads to catch the container as it comes up.
const RELOAD_SCHEDULE_MS = [7_000, 15_000, 30_000];

export function PatientPanel(props: { url: string; label: string }) {
  const [reloadTick, setReloadTick] = useState(0);
  const isPreview = props.label !== "production";

  useEffect(() => {
    setReloadTick(0);
    if (!isPreview) return;
    const timers = RELOAD_SCHEDULE_MS.map((ms) =>
      setTimeout(() => setReloadTick((t) => t + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [props.url, isPreview]);

  let host = "";
  try {
    host = new URL(props.url).host;
  } catch {
    host = props.url;
  }

  function manualReload() {
    setReloadTick((t) => t + 1);
  }

  return (
    <div className="panel" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
      <div className="patient-tag">
        <div>
          <span className="patient-tag-label">Patient:</span>{" "}
          <span className={`patient-tag-value ${isPreview ? "railway" : "ok"}`}>
            {props.label}
          </span>
          <span className="patient-tag-host">{host}</span>
        </div>
        <button className="tag-reload" onClick={manualReload} title="reload iframe">
          ↻
        </button>
      </div>
      <iframe
        key={`${props.url}-${reloadTick}`}
        className="patient-frame"
        src={props.url}
        title="Patient"
      />
    </div>
  );
}
