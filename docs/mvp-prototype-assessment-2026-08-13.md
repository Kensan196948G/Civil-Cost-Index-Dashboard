# MVP / Prototype Assessment - 2026-08-13

## Scope

This pass treated the codebase, tests, migrations, Git history, GitHub issues/PRs, and local diffs as the source of truth. No production deploy, production secret change, production DB migration, DNS change, or real-data insertion was performed.

Repository-specific instruction files checked: no `AGENTS.md`, `AGENTS.override.md`, or `CLAUDE.md` exists under this repository root. The active Codex/developer instructions therefore apply, with existing user changes preserved.

GitHub connector state:

- Repository: `Kensan196948G/Civil-Cost-Index-Dashboard`
- Visibility: private
- Permissions available to connector/account: admin/maintain/push/pull/triage
- Auto-merge: disabled by repository settings
- Open issues reviewed: #2-#10, mainly production domain, monitoring, Cloudflare Access, real data, scheduled fetch, PDF/xlsx backlog
- Recent merged PRs reviewed: #11, #12, #15, #19

Subagents were requested and started, but all three subagents hit a `functions.exec` SIGTRAP before reading files. The primary agent re-ran the evidence-gathering locally and is responsible for this assessment.

## Product Position

CCI is now more than the original market dashboard requirement. The actual product is a construction cost intelligence and estimating prototype:

- Market dashboard, time-series, compare, table, alerts, CSV/XLSX/PDF/PPTX exports
- Data source, upload/fetch job, scheduled ingestion, staged approval workflows
- RBAC, Cloudflare Access/Admin Key/Basic auth support, operation audit logs
- Project impact simulation and management KPI dashboard
- Estimation bases, work type trees, quantities, breakdowns, overhead rates
- Estimate calculation, immutable input snapshot, approval/rejection/supersede workflow
- Quotations, construction records, change orders, port cost model, AI summaries and candidates

The current MVP goal is not production finalization. It is to leave a local/development environment where the above major workflows can be operated and evaluated with fictitious data.

## Evidence-Based Status

| Area | Status | Evidence |
| --- | --- | --- |
| README / docs alignment | Partial | README matches Hono/Neon/Cloudflare direction; original requirement/design docs still describe FastAPI/SQLite and earlier scope in places |
| API surface | Implemented | `apps/api/src/index.ts` exposes dashboard, data, projects, estimates, reports, admin, AI, port, quotation, change-order routes |
| DB / migrations | Implemented | 001-019 migrations cover masters, RBAC, price versions, schedules, projects, estimating, quotations, construction records, approval flow |
| UI | Implemented / partial | Next.js app has screens for the major workflows; some pages still have dense admin UI and simple empty states |
| Auth / RBAC | Implemented / improved | `requireRole` on protected routes; anonymous viewer only with `ALLOW_ANONYMOUS_VIEWER=true`; this pass adds security headers and rate limit |
| Audit | Implemented | `operation_audit_logs` plus audit writes around mutation routes |
| Demo data | Partial -> improved | Existing samples cover time-series; this pass adds `npm run db:seed:demo` for fictitious projects, estimates, quotations, records, users |
| Exports | Implemented / improved | CSV/XLSX/PDF/PPTX endpoints exist; this pass makes UI downloads send saved Admin Key headers |
| Tests / CI | Implemented / partial | GitHub Actions runs API/Web lint/type/test/build. Local API/Web lint/type/test and API build pass; local Web build is blocked by sandbox Wasm memory |
| Production operations | Backlog | Production monitoring, domain, Access, real data, scheduled external fetch are tracked in issues and intentionally out of this MVP pass |
| License | Private / no explicit LICENSE | README badge states private license. No root `LICENSE` file found. |

## Gap and Priority Register

| ID | Priority | Finding | Impact | Effort | Risk / Dependency | Acceptance | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 | P0 | Broad unauthenticated API access existed before recent diffs | Data and workflow exposure | M | Auth semantics | Protected routes return 401 unless Admin Key/Access/Basic/demo flag | Implemented in existing diff and smoke tests |
| G-02 | P0 | Estimates needed explicit submit/approve/reject/supersede lifecycle | Approved estimate governance and reproducibility | M | migration 019 | draft/review/approved/superseded transitions, audit logs, delete lock | Implemented in existing diff |
| G-03 | P1 | Export links using `<a>` could not send `X-Admin-Key` | Authenticated MVP users could fail to download reports | S | Browser header limits | All major UI exports go through `downloadFile()` with saved Admin Key | Implemented |
| G-04 | P1 | API lacked lightweight rate limiting and consistent security headers | Basic MVP abuse and browser hardening gap | S | In-memory limit only | `RATE_LIMIT_PER_MINUTE`, 429, nosniff/frame/referrer/permissions headers | Implemented |
| G-05 | P1 | MVP demo data was mostly time-series; operational screens could be empty | Evaluators cannot operate vertical workflows immediately | M | DB seed order | `db:seed:demo` creates fictitious users/projects/quotes/records/estimates/snapshot | Implemented |
| G-06 | P2 | Original requirement/design docs still describe older FastAPI/SQLite/MVP scope | Onboarding confusion | M | Large doc set | Current README and assessment clarify actual architecture and MVP demo | Implemented partially; full rewrite backlog |
| G-07 | P2 | UI remains dense and admin-heavy | Usability cost for non-technical users | L | Design iteration | First-run demo flow and stronger task grouping | Backlog |
| G-08 | P2 | Local Next build can fail under constrained sandbox memory | Verification gap outside CI | M | Next/Wasm/ulimit | CI remains source of truth; local lint/type/test still pass | Backlog / documented |
| G-09 | P2 | Production monitoring, Access, DNS, real data not finalized | Cannot call production-ready | L | External services and approvals | Issues #2-#10 remain open | Backlog |
| G-10 | P3 | No explicit root license file | Legal clarity | S | Owner decision | Add `LICENSE` or private-use notice | Backlog |

## Implemented This Pass

1. API MVP safety:
   - `securityHeadersMiddleware`
   - `rateLimitMiddleware`
   - `RATE_LIMIT_PER_MINUTE` env support
   - smoke coverage for 401 headers and 429 rate limit

2. UI export usability:
   - authenticated file download via saved Admin Key
   - converted CSV/XLSX/PDF/PPTX report buttons and estimate/quotation/change-order exports away from raw anchor downloads where needed

3. Fictitious demo data:
   - `apps/api/scripts/seed-demo.mjs`
   - `npm run db:seed:demo`
   - demo users under `example.invalid`
   - fictitious client/supplier/project names only
   - project impact items, construction records, approved price versions, snapshot, quantities, estimate states, quotation comparison, change order, audit event

## Demo Data Structure

Run order:

```bash
cd apps/api
npm run db:migrate
npm run db:seed
npm run db:seed:demo
```

Seeded fictitious entities:

- Users:
  - `demo.viewer@example.invalid`
  - `demo.ingest@example.invalid`
  - `demo.estimator@example.invalid`
  - `demo.manager@example.invalid`
  - `demo.admin@example.invalid`
- Projects:
  - `デモ用 架空東湾排水幹線更新工事`
  - `デモ用 架空西港泊地浚渫工事`
- Suppliers:
  - `Fictional Civil Materials Co.`
  - `Imaginary Infrastructure Supply`
- Price snapshot:
  - `デモ用 2026-08 承認単価スナップショット`
- Estimate examples:
  - draft estimate
  - approved/superseded estimate
  - draft change estimate
- Other:
  - project items, construction records, quotation items, change-order lines, operation audit event

All seeded data is fictitious and tagged with `CCI-MVP-DEMO` where useful. It is intended to remain in the MVP/development database for immediate evaluation.

## Acceptance Checklist

| Check | Status |
| --- | --- |
| P0 unresolved count | 0 in MVP scope |
| Main UI/API/DB vertical workflows | Implemented with demo seed |
| Fictitious dummy data retained | Implemented through idempotent seed |
| README / demo instructions | Updated in this pass |
| API lint/type/test/build | Passed locally |
| API smoke against local demo DB | Passed locally: 45 tests |
| Web lint/type/test | Passed locally |
| Web build | Blocked locally by `WebAssembly.Instance(): Out of memory`; CI is authoritative for build in constrained environments |
| API runtime demo | Passed locally on `http://127.0.0.1:18180` with pgvector demo DB |
| PR / CI / merge | Pending after verification |

## Verification Evidence

Local commands run on 2026-08-13:

```bash
cd apps/api
npm run lint
npm run typecheck
npm test
npm run build
# With local demo DATABASE_URL, DATABASE_URL_DIRECT, and ADMIN_API_KEY set:
npm run test:smoke

cd ../web
npm run lint
npm run typecheck
npm test
```

Result summary:

- API lint/typecheck/build passed.
- API test suite passed: 15 files, 147 tests.
- API smoke against local pgvector demo DB passed: 45 tests.
- Web lint/typecheck/test passed: 1 file, 4 tests.
- `git diff --check` passed.
- Local Web production build failed in this sandbox with `RangeError: WebAssembly.Instance(): Out of memory: Cannot allocate Wasm memory for new instance`. This is a host memory/Wasm constraint already tracked as backlog; it does not affect API runtime validation.

Runtime checks against local demo API:

- `GET /api/health/ready`: 200, database `ok`
- `GET /api/projects`: two fictitious demo projects
- `GET /api/estimates`: draft and superseded demo estimates
- `GET /api/estimates/{id}/export`: XLSX response
- Security headers present on normal API responses

## Remaining Backlog

P1 managed backlog:

- Full production Cloudflare Access rollout and monitoring (#3, #5, #10)
- Production real-data replacement and source license review (#8)
- Scheduled external fetch execution hardening (#7)
- Repository auto-merge cannot be used unless `allow_auto_merge` is enabled

P2/P3 backlog:

- Full rewrite of older Japanese requirement/design docs to match Hono/Neon/Cloudflare and expanded estimating scope
- First-run guided demo flow
- Explicit private license file or owner-approved license notice
- UI information architecture pass for dense admin pages

## MVP Decision

Current decision after local verification: `CONDITIONAL GO`.

Reason: the repository has enough implemented surface to operate and evaluate the prototype, and this pass fills major demo-data and MVP safety gaps. The condition is GitHub PR CI and repository merge policy. Repository auto-merge is disabled, so final merge depends on the normal protected-branch process.
