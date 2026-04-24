import type { SignalRow, Classification } from "@signal/shared";

export async function classify(signal: SignalRow): Promise<Classification> {
  const source = signal.source;
  if (source === "synthetic.typo") return "code_fix";
  if (source === "synthetic.failure_rate") return "code_fix";
  if (source === "railway.deployment") return "code_fix";
  if (source === "railway.logs") return "code_fix";
  if (source === "github.workflow") return "code_fix";
  if (source === "posthog.alert") return "ignore";
  return "ignore";
}
