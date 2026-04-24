import { query } from "./db.js";

function token(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error("GITHUB_TOKEN is not set");
  return t;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token()}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

interface GhPr {
  number: number;
  state: string;
  merged_at: string | null;
  head: { ref: string };
}

export async function pollGithubPrs(): Promise<void> {
  const owner = process.env.GITHUB_OWNER ?? "dizzydes";
  const repo = process.env.GITHUB_REPO ?? "signal";

  const prs = await gh<GhPr[]>(`/repos/${owner}/${repo}/pulls?state=all&per_page=30`);

  for (const pr of prs) {
    const existing = await query<{ id: number; merged_at: Date | null }>(
      `SELECT id, merged_at FROM pull_requests WHERE github_pr_number = $1`,
      [pr.number]
    );
    if (existing.length === 0) continue;
    if (pr.merged_at && !existing[0].merged_at) {
      await query(
        `UPDATE pull_requests SET merged_at = $1 WHERE github_pr_number = $2`,
        [pr.merged_at, pr.number]
      );
      await query(
        `UPDATE signals SET status = 'merged', resolved_at = now()
         WHERE id = (SELECT signal_id FROM pull_requests WHERE github_pr_number = $1)`,
        [pr.number]
      );
      console.log(`[poller/github] PR #${pr.number} merged`);
    }
  }
}
