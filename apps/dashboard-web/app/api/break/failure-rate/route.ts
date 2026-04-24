import { NextResponse } from "next/server";
import { query } from "@signal/shared";
import { setServiceVariable } from "../../../../src/railway-client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { rate } = (await req.json().catch(() => ({ rate: 0 }))) as { rate?: number };
  const clamped = Math.max(0, Math.min(1, Number(rate ?? 0)));

  const serviceId = process.env.RAILWAY_PATIENT_WEB_SERVICE_ID;
  const environmentId = process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID;
  const projectId = process.env.RAILWAY_PROJECT_ID;

  if (!serviceId || !environmentId || !projectId) {
    return NextResponse.json(
      { error: "missing RAILWAY_* env vars; cannot mutate patient" },
      { status: 500 }
    );
  }

  await setServiceVariable({
    projectId,
    environmentId,
    serviceId,
    name: "FAILURE_RATE",
    value: String(clamped),
  });

  if (clamped > 0) {
    await query(
      `INSERT INTO signals (source, payload, status)
       VALUES ('synthetic.failure_rate', $1::jsonb, 'pending')`,
      [
        JSON.stringify({
          title: `patient-web /api/status returning 5xx at ${Math.round(clamped * 100)}%`,
          file: "apps/patient-web/src/index.ts",
          summary:
            "Production users are seeing intermittent 500s from /api/status. Remove the failure-rate branch from the endpoint handler so it always returns a healthy response.",
          failure_rate: clamped,
        }),
      ]
    );
  }

  return NextResponse.json({ message: `FAILURE_RATE set to ${clamped}` });
}
