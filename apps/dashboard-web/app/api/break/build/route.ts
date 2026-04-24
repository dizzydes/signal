import { NextResponse } from "next/server";
import { commitBrokenDependency } from "../../../../src/github-client";

export const dynamic = "force-dynamic";

export async function POST() {
  const owner = process.env.GITHUB_OWNER ?? "dizzydes";
  const repo = process.env.GITHUB_REPO ?? "signal";
  const path = "apps/patient-web/package.json";

  const result = await commitBrokenDependency({
    owner,
    repo,
    path,
    depToRemove: "chalk",
    branch: "main",
    message: "demo: remove chalk dependency to break the build",
  });

  return NextResponse.json({ message: `committed ${result.sha.slice(0, 7)} to main` });
}
