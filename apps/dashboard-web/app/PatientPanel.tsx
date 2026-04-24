"use client";

export function PatientPanel(props: { url: string; label: string }) {
  let host = "";
  try {
    host = new URL(props.url).host;
  } catch {
    host = props.url;
  }
  const isPreview = props.label !== "production";

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
      </div>
      <iframe key={props.url} className="patient-frame" src={props.url} title="Patient" />
    </div>
  );
}
