import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const failureRate = Math.min(1, Math.max(0, Number(process.env.FAILURE_RATE ?? 0)));
const leak = process.env.MEMORY_LEAK === "1";

const leakyBucket: string[] = [];
let heartbeatCount = 0;

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/api/status", (_req, res) => {
  if (Math.random() < failureRate) {
    res.status(500).json({ ok: false, error: "simulated failure" });
    return;
  }
  res.json({ ok: true, failureRate });
});

app.get("/heartbeat", (_req, res) => {
  heartbeatCount += 1;
  res.json({ ok: true, beats: heartbeatCount, leaking: leak });
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Patient</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; padding: 48px; max-width: 520px; margin: 0 auto; color: #111; }
      h1 { font-size: 20px; font-weight: 600; }
      button { background: #7c3aed; color: white; border: 0; padding: 10px 18px; border-radius: 6px; font-size: 14px; cursor: pointer; }
      button:hover { background: #6d28d9; }
      p { color: #555; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Patient</h1>
    <p>This is a minimal app that a healing loop watches over.</p>
    <button id="cta">Sigup</button>
    <p id="status" style="margin-top: 32px;">failure rate: ${failureRate}</p>
    <script>
      document.getElementById("cta").addEventListener("click", () => {
        alert("(This button is labelled wrong on purpose.)");
      });
    </script>
  </body>
</html>`);
});

app.listen(port, () => {
  console.log(`[patient] listening on ${port} failureRate=${failureRate} leak=${leak}`);
});

setInterval(() => {
  heartbeatCount += 1;
  if (leak) {
    leakyBucket.push("x".repeat(1024 * 128));
  }
}, 5_000);
