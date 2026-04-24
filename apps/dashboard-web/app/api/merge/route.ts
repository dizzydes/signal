import { NextResponse } from "next/server";
import { query } from "../../../src/db";
import { mergePullRequest } from "../../../src/github-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { pr_number } = (await req.json()) as { pr_number?: number };
  if (!pr_number) {
    return NextResponse.json({ error: "pr_number required" }, { status: 400 });
  }
  const owner = process.env.GITHUB_OWNER ?? "dizzydes";
  const repo = process.env.GITHUB_REPO ?? "signal";

  await mergePullRequest({ owner, repo, pull_number: pr_number });

  await query(
    `UPDATE pull_requests SET merged_at = now() WHERE github_pr_number = $1`,
    [pr_number]
  );
  await query(
    `UPDATE signals SET status = 'merged', resolved_at = now()
     WHERE id = (SELECT signal_id FROM pull_requests WHERE github_pr_number = $1)`,
    [pr_number]
  );

  return NextResponse.json({ message: `merged #${pr_number}` });
}
