import { NextResponse } from "next/server";
import { query } from "@signal/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await query(
    `SELECT s.*, pr.github_pr_number, pr.preview_url, pr.merged_at
     FROM signals s
     LEFT JOIN pull_requests pr ON pr.signal_id = s.id
     ORDER BY s.created_at DESC LIMIT 50`
  );
  return NextResponse.json({ rows });
}
