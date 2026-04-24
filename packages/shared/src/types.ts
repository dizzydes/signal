export type SignalSource =
  | "synthetic.typo"
  | "railway.logs"
  | "railway.deployment"
  | "github.workflow"
  | "posthog.alert";

export type SignalStatus =
  | "pending"
  | "claimed"
  | "classifying"
  | "healing"
  | "pr_open"
  | "merged"
  | "failed"
  | "ignored";

export type Classification = "ignore" | "config_fix" | "code_fix";

export interface SignalRow {
  id: number;
  source: SignalSource;
  payload: Record<string, unknown>;
  status: SignalStatus;
  classification: Classification | null;
  claimed_at: Date | null;
  created_at: Date;
  resolved_at: Date | null;
}

export interface TranscriptCommand {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  started_at: string;
  ended_at: string;
}

export interface TranscriptRow {
  id: number;
  signal_id: number;
  commands: TranscriptCommand[];
  reasoning: string | null;
  diff: string | null;
  created_at: Date;
}

export interface PullRequestRow {
  id: number;
  signal_id: number;
  github_pr_number: number;
  branch: string;
  preview_url: string | null;
  services_rebuilt: string[];
  services_skipped: string[];
  build_ms: number | null;
  merged_at: Date | null;
  created_at: Date;
}
