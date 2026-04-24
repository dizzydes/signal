import { NextResponse } from "next/server";
import { query } from "../../../../src/db";
import { reintroduceTypoIfMissing } from "../../../../src/github-client";

export const dynamic = "force-dynamic";

export async function POST() {
  const owner = process.env.GITHUB_OWNER ?? "dizzydes";
  const repo = process.env.GITHUB_REPO ?? "signal";

  let reintroduced = false;
  try {
    const r = await reintroduceTypoIfMissing({ owner, repo, branch: "main" });
    reintroduced = r.committed;
  } catch (err) {
    console.error("[break/typo] re-introduce failed", err);
  }

  const payload = {
    title: "Typo on landing page: 'Sigup'",
    file: "apps/patient-web/src/index.ts",
    before: "Sigup",
    after: "Sign up",
    summary: "Synthetic PostHog-style signal: visitors report the CTA button is misspelled.",
  };
  const rows = await query<{ id: number }>(
    `INSERT INTO signals (source, payload, status)
     VALUES ('synthetic.typo', $1::jsonb, 'pending')
     RETURNING id`,
    [JSON.stringify(payload)]
  );
  return NextResponse.json({
    message: reintroduced ? "typo re-introduced + signal queued" : "signal queued",
    id: rows[0].id,
  });
}
