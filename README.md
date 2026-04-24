# Signal (autoheal)

A public demo site that monitors a "patient" service, detects breaks, and opens GitHub PRs to fix them via an AI coding agent. The dashboard displays the full healing history including live Railway PR-environment preview links.

## Services

| Service | Stack | Role |
|---|---|---|
| `apps/dashboard-web` | Next.js 15 | Homepage with break-controls, timeline, transcript viewer, embedded patient iframe |
| `apps/poller` | Node + pg | 5 s tick — polls Railway GraphQL, GitHub, PostHog; files signals; attaches preview URLs |
| `apps/healer` | Node + Claude Agent SDK | Claims pending signals `FOR UPDATE SKIP LOCKED`, runs agent in sandboxed clone, opens PR |
| `apps/patient-web` | Express | "Sigup" typo button + `/api/status` honouring `FAILURE_RATE` |
| `apps/patient-worker` | Node | `/heartbeat` + `MEMORY_LEAK` toggle |

Each service is a standalone npm package. Shared DB connection and signal types are inlined per service (`src/db.ts`, `src/types.ts`) so each can be built and deployed with its own root directory on Railway. Migration and reset scripts live at the repo root in `scripts/`.

## Local dev

```bash
pnpm install

# migrate Postgres (requires DATABASE_URL)
pnpm migrate

# run individual services
pnpm dev:patient-web
pnpm dev:patient-worker
pnpm dev:dashboard-web
pnpm dev:poller
pnpm dev:healer
```

## Deploy to Railway

Each service has its own `railway.json` with `watchPatterns` so Focused PR Environments only rebuild affected services.

**One-time setup**

1. Create a Railway project, provision a Postgres plugin.
2. Create five services pointing at this repo, each with **Root Directory** set to its package folder and **Config File Path** left as default (`railway.json` at the root directory):
   - `dashboard-web` — root `apps/dashboard-web`
   - `poller` — root `apps/poller`
   - `healer` — root `apps/healer`
   - `patient-web` — root `apps/patient-web`
   - `patient-worker` — root `apps/patient-worker`
3. On each service, reference `DATABASE_URL` from the Postgres plugin.
4. Set sealed variables on services that need them (see `.env.example`):
   - `dashboard-web`: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_PRODUCTION_ENVIRONMENT_ID`, `RAILWAY_PATIENT_WEB_SERVICE_ID`, `PATIENT_WEB_URL`
   - `poller`: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_PRODUCTION_ENVIRONMENT_ID`
   - `healer`: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `ANTHROPIC_API_KEY`
   - `patient-web`: `FAILURE_RATE` (starts at 0)
   - `patient-worker`: `MEMORY_LEAK` (starts at 0)
5. Run the migration once: `DATABASE_URL=... pnpm migrate` locally, or add a one-off job.

**First deploy**

Push `main`. Railway auto-detects the monorepo and builds each service per its `railway.json`. Healthchecks run against `/healthz` on patient services and dashboard.

## The demo

- **Fix the typo** — inserts a synthetic signal. Healer opens a PR changing `Sigup` → `Sign up` in `apps/patient-web/src/index.ts`.
- **Crash the endpoint** — slider sets `FAILURE_RATE` on `patient-web` via Railway API. A synthetic signal fires. Healer opens a PR removing the failure-rate branch.
- **Break the build** — commits to main removing `chalk` from `apps/patient-worker/package.json`. Railway build fails. Poller detects the failed deployment. Healer restores the dep.
- **Merge** — each healing PR gets a Merge button that squash-merges via GitHub API. Poller picks up the merge on its next tick and flips signal status to `merged`.

## Reset

```bash
pnpm reset
```

Resets patient sources to the `demo-base` tag, clears signals older than N minutes, and restores `FAILURE_RATE=0` / `MEMORY_LEAK=0` on Railway. See `scripts/reset.ts`.
