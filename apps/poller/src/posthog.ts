export async function pollPosthog(): Promise<void> {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!projectId || !apiKey) return;
}
