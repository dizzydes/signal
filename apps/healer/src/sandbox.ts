import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile as execFileCb, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface Sandbox {
  dir: string;
  id: string;
}

function repoUrl(): string {
  const owner = process.env.GITHUB_OWNER ?? "dizzydes";
  const repo = process.env.GITHUB_REPO ?? "signal";
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

export async function prepareSandbox(): Promise<Sandbox> {
  const base = await mkdtemp(join(tmpdir(), "healer-"));
  const id = randomUUID();
  const dir = join(base, id);

  await execFile("git", ["clone", "--depth", "1", repoUrl(), dir], { timeout: 60_000 });
  await execFile("git", ["-C", dir, "config", "user.name", process.env.GIT_USER_NAME ?? "autoheal"]);
  await execFile("git", [
    "-C",
    dir,
    "config",
    "user.email",
    process.env.GIT_USER_EMAIL ?? "autoheal@users.noreply.github.com",
  ]);
  return { dir, id };
}

export async function applyAndPush(
  sandbox: Sandbox,
  input: { branch: string; commitMessage: string; diff: string }
): Promise<void> {
  await execFile("git", ["-C", sandbox.dir, "checkout", "-b", input.branch]);

  const applied = await runWithStdin("git", ["-C", sandbox.dir, "apply", "--whitespace=nowarn", "-"], input.diff);
  if (applied.code !== 0) {
    throw new Error(`git apply failed (${applied.code}): ${applied.stderr}`);
  }

  await execFile("git", ["-C", sandbox.dir, "add", "-A"]);
  await execFile("git", ["-C", sandbox.dir, "commit", "-m", input.commitMessage]);
  await execFile("git", ["-C", sandbox.dir, "push", "-u", "origin", input.branch]);
}

export async function cleanupSandbox(sandbox: Sandbox): Promise<void> {
  await rm(sandbox.dir, { recursive: true, force: true }).catch(() => {});
}

function runWithStdin(
  cmd: string,
  args: string[],
  input: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.write(input);
    child.stdin.end();
  });
}
