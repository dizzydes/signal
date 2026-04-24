"use client";

export function PatientPanel(props: { url: string }) {
  let host = "";
  try {
    host = new URL(props.url).host;
  } catch {
    host = props.url;
  }

  return (
    <div className="panel" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
      <div className="patient-tag">
        <span className="patient-tag-label">Patient:</span>{" "}
        <span className="patient-tag-value ok">production</span>
        <span className="patient-tag-host">{host}</span>
      </div>
      <iframe className="patient-frame" src={props.url} title="Patient" />
    </div>
  );
}
