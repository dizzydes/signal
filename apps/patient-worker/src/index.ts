import express from "express";
import chalk from "chalk";

const app = express();
const port = Number(process.env.PORT ?? 3002);
const leak = process.env.MEMORY_LEAK === "1";

const leakyBucket: string[] = [];
let heartbeatCount = 0;

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/heartbeat", (_req, res) => {
  heartbeatCount += 1;
  res.json({ ok: true, beats: heartbeatCount, leaking: leak });
});

app.listen(port, () => {
  console.log(chalk.green(`[patient-worker] listening on ${port} leak=${leak}`));
});

setInterval(() => {
  heartbeatCount += 1;
  if (leak) {
    leakyBucket.push("x".repeat(1024 * 128));
  }
  console.log(`[patient-worker] tick beats=${heartbeatCount} held=${leakyBucket.length}`);
}, 5_000);
