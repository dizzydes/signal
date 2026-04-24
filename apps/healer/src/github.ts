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
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function openPullRequest(input: {
  branch: string;
  title: string;
  body: string;
}): Promise<{ number: number; html_url: string }> {
  const owner = process.env.GITHUB_OWNER ?? "dizzydes";
  const repo = process.env.GITHUB_REPO ?? "signal";
  const base = process.env.GITHUB_BASE_BRANCH ?? "main";

  return gh<{ number: number; html_url: string }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.branch,
        base,
      }),
    }
  );
}
