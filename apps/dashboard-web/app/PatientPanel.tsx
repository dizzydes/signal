"use client";

export function PatientPanel(props: {
  url: string;
  label: string;
  onReset: () => void;
  isDefault: boolean;
}) {
  let host = "";
  try {
    host = new URL(props.url).host;
  } catch {
    host = props.url;
  }

  return (
    <div className="panel" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
      <div className="patient-tag">
        <div>
          <span className="patient-tag-label">Patient:</span>{" "}
          <span className={`patient-tag-value ${props.isDefault ? "ok" : "railway"}`}>
            {props.label}
          </span>
          <span className="patient-tag-host">{host}</span>
        </div>
        {!props.isDefault && (
          <button onClick={props.onReset}>← back to production</button>
        )}
      </div>
      <iframe
        key={props.url}
        className="patient-frame"
        src={props.url}
        title="Patient"
      />
    </div>
  );
}
