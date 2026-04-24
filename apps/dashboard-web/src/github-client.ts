function token(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error("GITHUB_TOKEN is not set");
  return t;
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token()}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function commitBrokenDependency(input: {
  owner: string;
  repo: string;
  path: string;
  depToRemove: string;
  branch: string;
  message: string;
}): Promise<{ sha: string }> {
  const fileRes = await gh<{ sha: string; content: string; encoding: string }>(
    `/repos/${input.owner}/${input.repo}/contents/${encodeURIComponent(input.path)}?ref=${input.branch}`
  );
  const pkg = JSON.parse(Buffer.from(fileRes.content, fileRes.encoding as BufferEncoding).toString("utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (pkg.dependencies) delete pkg.dependencies[input.depToRemove];
  const newContent = Buffer.from(JSON.stringify(pkg, null, 2) + "\n", "utf8").toString("base64");

  const commit = await gh<{ commit: { sha: string } }>(
    `/repos/${input.owner}/${input.repo}/contents/${encodeURIComponent(input.path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: input.message,
        content: newContent,
        sha: fileRes.sha,
        branch: input.branch,
      }),
    }
  );
  return { sha: commit.commit.sha };
}

export async function mergePullRequest(input: {
  owner: string;
  repo: string;
  pull_number: number;
}): Promise<void> {
  await gh(`/repos/${input.owner}/${input.repo}/pulls/${input.pull_number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
}
