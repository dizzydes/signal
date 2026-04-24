"use client";

import { useState, useTransition } from "react";

export function BreakControls(props: {
  onEvent?: (kind: "action" | "error", text: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [failureRate, setFailureRate] = useState(0);

  async function post(path: string, body: unknown, actionLabel: string) {
    props.onEvent?.("action", actionLabel);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const j = (await res.json().catch(() => ({}))) as { message?: string; id?: number | string; error?: string };
      if (res.ok) {
        const detail = j.message ?? "ok";
        props.onEvent?.("action", `${actionLabel} → ${detail}${j.id ? ` (signal #${j.id})` : ""}`);
      } else {
        props.onEvent?.("error", `${actionLabel} failed: ${j.error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      props.onEvent?.("error", `${actionLabel} failed: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <div className="break-card">
        <h3>Fix the typo</h3>
        <p>Inserts a synthetic signal pointing at the "Sigup" button. Healer opens a PR fixing the copy.</p>
        <button
          className="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(() => post("/api/break/typo", {}, "trigger typo signal"))
          }
        >
          Trigger typo signal
        </button>
      </div>

      <div className="break-card">
        <h3>Crash the endpoint</h3>
        <p>Sets FAILURE_RATE on patient-web via Railway API. Poller sees 5xx rate in logs and files a signal.</p>
        <input
          type="range"
          min={0}
          max={100}
          value={failureRate}
          onChange={(e) => setFailureRate(Number(e.target.value))}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          <span>0%</span>
          <span>{failureRate}%</span>
          <span>100%</span>
        </div>
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(() =>
              post("/api/break/failure-rate", { rate: failureRate / 100 }, `set FAILURE_RATE=${failureRate}%`)
            )
          }
        >
          Apply failure rate
        </button>
      </div>

      <div className="break-card">
        <h3>Break the build</h3>
        <p>Commits a missing-dependency fault to patient-web on main. Railway build fails. Healer restores the dep.</p>
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(() => post("/api/break/build", {}, "break build (remove chalk from patient-web)"))
          }
        >
          Break build
        </button>
      </div>
    </>
  );
}
