import { NextResponse } from "next/server";
import { query } from "../../../../src/db";

export const dynamic = "force-dynamic";

export async function POST() {
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
  return NextResponse.json({ message: "signal queued", id: rows[0].id });
}
