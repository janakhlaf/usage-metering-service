# Usage Metering and Quota Service

A real TypeScript/Express + PostgreSQL service that applies **both** account and user limits. The example web client simulates image generation requests, but consumption, authorization and persistence are real. No external AI API is required.

## Run locally (Windows PowerShell)

1. Start Docker Desktop (Engine running).
2. In this folder run `docker compose up --build -d`.
3. Check `docker compose ps`, then `http://localhost:3000/health` and open **http://localhost:8080**.
4. Click **Create account + API key**, then add users and press **Generate Image (simulate)**.
5. Stop with `docker compose down` (keeps database). **Never use `docker compose down -v` unless you intentionally want to erase the database.**

**Security:** the default admin secret and DB password are LOCAL DEMO VALUES only. Before any external deployment set `ADMIN_SECRET` via `.env`, change DB credentials, use HTTPS, and do not expose admin provisioning publicly. Client keeps account key on its server, not browser. The demo server is for local use only; it is not a production login system. Do not commit `.env` or real API keys.

## Model

- Account: one calling application; unique generated API key (only SHA-256 hash stored in DB), one account plan.
- User: belongs to exactly one account and has one user plan.
- Plan: predefined global plan or account-owned custom plan. Has `monthly_limit` and `max_per_request`.
- Units: one abstract resource, e.g. a simulated image. No actual image is generated.
- UTC month: `YYYY-MM` from server UTC clock; new month starts with zero usage, old data stays.
- Account usage is sum of accepted user usage, and is tracked independently of user totals. All-or-nothing consumption.

## API

Admin provisioning uses `x-admin-secret`; other `/api/*` endpoints use `x-api-key` in HTTP request header. Account isolation is enforced on user IDs and custom plan ownership.

| Method | Path | Body / purpose |
|---|---|---|
| POST | `/admin/accounts` | `{ "name":"My App" }` → `apiKey` shown once |
| GET | `/api/account` | account and applied plan |
| PATCH | `/api/account/plan` | `{ "planId":"UUID" }` |
| GET | `/api/plans` | visible predefined and custom plans |
| POST | `/api/plans` | `{ "name":"VIP", "scope":"user", "monthlyLimit":50, "maxPerRequest":10 }` |
| PATCH | `/api/plans/:id` | `{ "monthlyLimit":80, "maxPerRequest":15 }` (custom only) |
| GET | `/api/users` | users and applied plans |
| POST | `/api/users` | `{ "name":"Ahmed", "planId":"UUID" }` |
| PATCH | `/api/users/:id/plan` | `{ "planId":"UUID" }` |
| POST | `/api/consume` | `{ "userId":"UUID", "units":3, "requestId":"unique-string" }` |
| GET | `/api/usage?month=2026-10` | account and user totals and remaining; month optional |
| GET | `/api/history?limit=20&offset=0` | paginated accepted/rejected history |
| GET | `/health` | DB health |

Example:
```powershell
$body = '{"name":"My App"}'
Invoke-RestMethod -Uri http://localhost:3000/admin/accounts -Method Post -ContentType application/json -Headers @{ 'x-admin-secret'='local-admin-change-me' } -Body $body
```
Copy returned `apiKey` securely. Then use it as `x-api-key` for `/api/*` calls. The web demo handles this for you.

## Predefined plans

| Scope | Name | Monthly | Per request |
|---|---|---:|---:|
| account | Starter | 100 | 20 |
| account | Pro | 1000 | 100 |
| user | Basic | 10 | 5 |
| user | Premium | 100 | 20 |

All limits are example values. Accounts default to Starter. Users must select a user plan when created. Predefined plans are read-only. Custom plans belong to the account that created them; editing one affects all assigned users/accounts on subsequent requests. Switching plans does **not** reset consumption. If a limit is lowered below already consumed units, remaining shows 0 and new requests are rejected.

## Request decisions and safe retries

- `accepted:true` records units in user and account totals in one SQL transaction.
- `accepted:false` records a rejected request but consumes zero units; `reason` identifies `max_per_request` or `monthly_allowance`, and `level` identifies `account` or `user`.
- `requestId` is unique per account. Repeating it with the same user and units returns the original decision with `duplicate:true` and **does not charge again**. Reusing it with a different payload returns HTTP 409.
- The consume transaction locks the **account row** (`SELECT ... FOR UPDATE`) before reading totals, and serializes concurrent consumes on the same account. This is intentionally simple and correct but limits throughput for hot accounts. Account plan switches use the same row; custom plan edits may race with a consume already in progress and take effect for subsequent requests.
- We do not reserve/refund usage for failed downstream actions; this service meters *accepted requests*, not actual external AI execution. No payments, refunds, RBAC, end-user login, multiple resource types, or distributed infrastructure.

## Tests

With PostgreSQL running, execute from `backend`:
```powershell
$env:DATABASE_URL='postgres://quota:quota_local_dev@localhost:5433/quota'
$env:ADMIN_SECRET='local-admin-change-me'
npm install
npm test
```
The integration test covers missing/invalid keys, account isolation, accepted consumption, retry idempotency, conflicting request IDs, concurrency, totals and history. It creates test data in the local database. Run `npm run build` to typecheck/build.

## Performance test (reproducible)

After creating a test account/user, run in project root:
```powershell
$env:API_KEY='quota_YOUR_KEY'
$env:USER_ID='YOUR_USER_UUID'
$env:REQUESTS='100'
$env:CONCURRENCY='10'
node perf/load.js
```
The script reports accepted/rejected/errors, total duration, p50 and p95 latency. For meaningful acceptance throughput, assign sufficiently large custom account and user plans first. Re-run with different concurrency and verify `/api/usage` totals. **Actual benchmark numbers must be collected on your machine; none are fabricated in this repository.** Record machine specs, commands, results and bottlenecks in `PERFORMANCE_RESULTS.md`.

## Design choices, assumptions and limitations

- TypeScript/Express service, PostgreSQL as source of truth, simple Express demo client.
- UUID identifiers; UTC calendar months; one unit resource; integer units only; limit >=0 and per-request max >0.
- Bootstrap account creation requires a separate admin secret because otherwise anyone could mint account keys. In production this needs stronger provisioning and secret management.
- Account-level serialization favors correctness over peak throughput; a more scalable solution could use atomic counters/partitioning with careful locking.
- No migrations beyond initial SQL initialization: database schema auto-loads only on the first creation of the Docker volume. Future schema changes require migrations.
- No rate limiting or production monitoring, no key rotation, no refund on downstream failure, no account deletion, no authentication for the demo web interface. Do not deploy this demo publicly.
- Pagination uses offset; stable ordering is by timestamp and UUID. Historical usage is preserved; historical plan limits are not snapshotted.
