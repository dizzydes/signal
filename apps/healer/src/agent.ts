import { query as runAgent } from "@anthropic-ai/claude-agent-sdk";
import type { SignalRow, TranscriptCommand } from "@signal/shared";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface AgentResult {
  commands: TranscriptCommand[];
  diff: string;
  reasoning: string | null;
}

const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 180_000);

export async function runAgentInSandbox(input: {
  cwd: string;
  signal: SignalRow;
}): Promise<AgentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

  const commands: TranscriptCommand[] = [];
  const pending = new Map<string, { started_at: string; command: string }>();
  const reasoningParts: string[] = [];

  const prompt = buildPrompt(input.signal);

  try {
    for await (const message of runAgent({
      prompt,
      options: {
        cwd: input.cwd,
        model: process.env.AGENT_MODEL ?? "claude-sonnet-4-6",
        systemPrompt: SYSTEM_PROMPT,
        permissionMode: "acceptEdits",
        maxTurns: 12,
        allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
        abortController: controller,
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                async (ev: unknown, toolUseID: string | undefined) => {
                  const key = toolUseID ?? `anon-${commands.length}`;
                  const input = (ev as { tool_input?: { command?: string } }).tool_input;
                  pending.set(key, {
                    started_at: new Date().toISOString(),
                    command: input?.command ?? "",
                  });
                  const cmd = input?.command ?? "";
                  if (cmd.match(/(\s|^)(cd\s+(\/|\.\.|~)|rm\s+-rf\s+\/)/)) {
                    return {
                      hookSpecificOutput: {
                        hookEventName: "PreToolUse",
                        permissionDecision: "deny",
                        permissionDecisionReason: "command tried to escape sandbox",
                      },
                    };
                  }
                  return {};
                },
              ],
            },
          ],
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [
                async (ev: unknown, toolUseID: string | undefined) => {
                  const key = toolUseID ?? "";
                  const started = pending.get(key);
                  pending.delete(key);
                  const resp = (ev as { tool_response?: { stdout?: string; stderr?: string; exit_code?: number } }).tool_response ?? {};
                  commands.push({
                    command: started?.command ?? "",
                    stdout: resp.stdout ?? "",
                    stderr: resp.stderr ?? "",
                    exit_code: resp.exit_code ?? 0,
                    started_at: started?.started_at ?? new Date().toISOString(),
                    ended_at: new Date().toISOString(),
                  });
                  return {};
                },
              ],
            },
          ],
        },
      },
    })) {
      if (isAssistantMessage(message)) {
        for (const block of message.message?.content ?? []) {
          if (block.type === "text" && typeof block.text === "string") {
            reasoningParts.push(block.text);
          }
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const diff = await collectDiff(input.cwd);

  return {
    commands,
    diff,
    reasoning: reasoningParts.join("\n\n").trim() || null,
  };
}

async function collectDiff(cwd: string): Promise<string> {
  try {
    await execFile("git", ["-C", cwd, "add", "-A"], { timeout: 30_000 });
    const { stdout } = await execFile("git", ["-C", cwd, "diff", "--cached"], {
      timeout: 30_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    await execFile("git", ["-C", cwd, "reset"], { timeout: 30_000 }).catch(() => {});
    return stdout;
  } catch {
    return "";
  }
}

function isAssistantMessage(m: unknown): m is { message?: { content?: Array<{ type?: string; text?: string }> } } {
  return typeof m === "object" && m !== null && (m as { type?: string }).type === "assistant";
}

const SYSTEM_PROMPT = `You are an autonomous code-fixing agent working inside a fresh git clone of a monorepo.

SCOPE: You may only modify files under apps/patient-web/ and apps/patient-worker/. Never touch apps/dashboard-web/, apps/poller/, apps/healer/, or packages/.

You will be given a signal describing a bug or failure. Your job:
1. Read the relevant file(s) to understand the issue.
2. Make the minimal change that resolves it. Do not refactor surrounding code. Do not add comments.
3. Do NOT commit or push — the parent process handles git. Just leave the working tree in the desired state.
4. When done, output a one-paragraph summary of what you changed and why.

Do not install new dependencies unless the signal explicitly says a dependency is missing.`;

function buildPrompt(signal: SignalRow): string {
  const p = signal.payload as Record<string, unknown>;
  const title = (p.title as string | undefined) ?? signal.source;
  const summary = (p.summary as string | undefined) ?? "";
  const hints = Object.entries(p)
    .filter(([k]) => !["title", "summary"].includes(k))
    .map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");

  return [
    `SIGNAL: ${title}`,
    "",
    summary,
    "",
    hints ? `Hints:\n${hints}` : "",
    "",
    "Fix this now. Make the smallest change that resolves the signal.",
  ]
    .filter(Boolean)
    .join("\n");
}
