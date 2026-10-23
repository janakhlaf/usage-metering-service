# Usage Metering and Quota Service

A backend service built with **TypeScript, Express, and PostgreSQL** that tracks resource consumption and enforces monthly quotas at both the account and individual user levels.

The service is designed for applications that need to determine whether a user can perform a resource-consuming action before executing it. Each application has a shared monthly allowance, while each registered user has an individual allowance. Both sets of limits must be satisfied for a request to be accepted.

A simple web client demonstrates the service through simulated image-generation requests. The image generation itself is simulated; however, API authentication, quota decisions, database transactions, usage tracking, and request history are implemented and persisted in PostgreSQL.

No external AI API is required.

## 1. Technology Stack

| Component | Technology |
|---|---|
| Backend | TypeScript, Node.js, Express |
| Database | PostgreSQL |
| Database access | `pg` (node-postgres) |
| Demo client | Node.js, Express, JavaScript |
| Containerization | Docker and Docker Compose |
| Testing | Node.js built-in test runner, `tsx` |
| API communication | REST APIs using JSON |
| Authentication | Account API keys and separate admin provisioning secret |

The project uses one backend service and one PostgreSQL database for its core functionality. The demo client is an additional interface for demonstrating the API.

## 2. Project Overview

Consider an application that provides resource-consuming operations, such as document processing or image generation.

Before performing an operation, the application sends a request to the Usage Metering and Quota Service containing:

- The user's identifier.
- The number of units requested.
- A unique request identifier.
- The application's API key in the request header.

The service identifies the account, validates the user, checks both account and user limits, and decides whether the request can proceed.

If the request is accepted, the full number of units is recorded against both the account and the user. If rejected, no units are consumed.

Every processed consumption decision is recorded for reporting and auditing.

## 3. Core Concepts

### Account

An account represents an application or company that consumes the service.

Each account:

- Has a unique identifier.
- Has an assigned account-level plan.
- Has an API key used for authenticated requests.
- Owns its users and custom plans.
- Has a shared monthly usage allowance.

### User

A user belongs to exactly one account.

Each user:

- Has a unique identifier.
- Has an assigned user-level plan.
- Maintains individual monthly usage totals.
- Shares the account's overall allowance with other users under the same account.

### Plan

A plan defines the rules governing consumption.

Each plan contains:

- A name.
- A scope: `account` or `user`.
- A monthly allowance (`monthly_limit`).
- A maximum number of units allowed in one request (`max_per_request`).

Plans can be predefined or custom.

### Units

A unit represents one abstract resource-consumption credit.

The project uses a single resource type throughout the system. In the demo interface, units represent simulated image-generation credits.

### Monthly Period

Usage is tracked using UTC calendar months in the format `YYYY-MM`.

For example:

`2026-10`

Usage from previous months remains stored. A new month starts with zero consumption without deleting historical records.

## 4. Run the Project Locally

### Requirements

Before starting, install:

- Docker Desktop.
- Node.js and npm, if running backend tests directly on the host.
- A web browser.
- VS Code or another code editor, if needed.

### Start the Application

Open Windows PowerShell in the project root and run:

```powershell
docker compose up --build -d
```

Check that the containers are running:

```powershell
docker compose ps
```

### Access the Application

**Backend health endpoint:**

http://localhost:3000/health

**Web demo:**

http://localhost:8080

### Using the Demo

1. Open the web interface.
2. Create an account and obtain its API key.
3. Add users and assign their plans.
4. Choose a user and simulate a resource-consuming request.
5. Review the acceptance or rejection decision.
6. Inspect account usage, user usage, and request history.
7. Modify plans to observe how updated limits affect subsequent requests.

### Stop the Application

```powershell
docker compose down
```

This stops the containers while preserving the database volume.

**Important:** Do not use `docker compose down -v` unless you intentionally want to delete the database volume and its stored data.

## 5. Accounts and API Key Authentication

Accounts are created through a separate administrative endpoint.

When an account is created, the service generates an API key. The key is returned to the caller during account creation.

Only a SHA-256 hash of the key is stored in the database.

Subsequent account operations require the key in the HTTP header:

```http
x-api-key: YOUR_API_KEY
```

The API key identifies the account and limits access to that account's resources.

### Authentication Rules

- Missing API keys are rejected.
- Invalid API keys are rejected.
- Users must belong to the authenticated account.
- Custom plans must belong to the authenticated account.
- An account cannot access or modify another account's private resources.

Administrative account provisioning uses a separate header:

```http
x-admin-secret: YOUR_ADMIN_SECRET
```

This separates account creation privileges from normal account API access.

### Security Considerations

The supplied configuration is intended for local development and demonstration.

Before external deployment:

- Replace demonstration credentials and secrets.
- Use HTTPS.
- Protect administrative provisioning.
- Add production-grade authentication and access controls for the web interface.
- Introduce rate limiting, monitoring, and secret rotation.
- Never commit `.env` files or real API keys to version control.

The demo client keeps the account API key on its server rather than exposing it directly in browser requests.

**The demonstration application should not be deployed publicly without additional security measures.**

## 6. Predefined Plans

The service provides predefined account and user plans.

| Scope | Plan | Monthly Allowance | Maximum per Request |
|---|---|---:|---:|
| Account | Starter | 100 | 20 |
| Account | Pro | 1,000 | 100 |
| User | Basic | 10 | 5 |
| User | Premium | 100 | 20 |

These values are example limits selected for demonstration.

New accounts use the Starter plan by default. A user plan must be selected when registering a user.

Predefined plans are shared, read-only definitions.

## 7. Custom Plans and Plan Management

Accounts can create custom plans for their own accounts or users.

A custom plan includes:

```json
{
  "name": "VIP",
  "scope": "user",
  "monthlyLimit": 50,
  "maxPerRequest": 10
}
```

Accounts can:

- Create custom plans.
- View predefined and account-owned plans.
- Update their own custom plans.
- Assign an account plan to the account.
- Assign a user plan to a user.
- Change plan assignments.

Multiple users may share the same custom plan definition while maintaining independent usage totals.

### Updating Plans

Changes to custom plan limits take effect without restarting or redeploying the service.

Updating a shared plan affects the users or accounts assigned to that plan on subsequent requests.

Changing an account or user's plan does not erase already consumed units.

For example, if a user has consumed 15 units and their new monthly allowance is 10, their remaining allowance is reported as zero. Further consumption is rejected until sufficient allowance becomes available.

This behavior prevents plan changes from being used to reset previously recorded consumption.

## 8. API Endpoints

Administrative provisioning uses the `x-admin-secret` header.

Other account API endpoints use the `x-api-key` header.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/admin/accounts` | Create an account and issue an API key |
| GET | `/api/account` | Retrieve account information and applied plan |
| PATCH | `/api/account/plan` | Change the account's plan |
| GET | `/api/plans` | List visible predefined and custom plans |
| POST | `/api/plans` | Create a custom plan |
| PATCH | `/api/plans/:id` | Update an account-owned custom plan |
| GET | `/api/users` | List users and their assigned plans |
| POST | `/api/users` | Register a user |
| PATCH | `/api/users/:id/plan` | Change a user's plan |
| POST | `/api/consume` | Request resource consumption |
| GET | `/api/usage` | Retrieve monthly account and user usage |
| GET | `/api/history` | Retrieve paginated consumption history |
| GET | `/health` | Check backend/database health |

### Create an Account

**Endpoint:**

```http
POST /admin/accounts
```

**Request body:**

```json
{
  "name": "My Application"
}
```

The response includes the new account information and its generated API key.

Store the returned API key securely.

### Create a User

**Endpoint:**

```http
POST /api/users
```

**Request body:**

```json
{
  "name": "Ahmed",
  "planId": "USER_PLAN_UUID"
}
```

The selected plan must be a user-scoped plan visible to the authenticated account.

### Change a User Plan

**Endpoint:**

```http
PATCH /api/users/USER_UUID/plan
```

**Request body:**

```json
{
  "planId": "NEW_USER_PLAN_UUID"
}
```

The updated plan is applied to subsequent consumption requests.

### Update a Custom Plan

**Endpoint:**

```http
PATCH /api/plans/PLAN_UUID
```

**Request body:**

```json
{
  "monthlyLimit": 80,
  "maxPerRequest": 15
}
```

Only account-owned custom plans can be modified.

Predefined plans are read-only.

## 9. Quota Consumption

### Request

**Endpoint:**

```http
POST /api/consume
```

**Request body:**

```json
{
  "userId": "USER_UUID",
  "units": 3,
  "requestId": "unique-request-001"
}
```

### Validation

A consumption request must contain:

- A valid user identifier.
- A positive whole number of units.
- A request identifier.
- A valid API key.

The user must belong to the account identified by the API key.

### Decision Process

The service checks:

1. Whether the requested units exceed the user's per-request maximum.
2. Whether the requested units exceed the account's per-request maximum.
3. Whether the user has sufficient remaining monthly allowance.
4. Whether the account has sufficient remaining monthly allowance.

A request is accepted only when all applicable limits permit it.

### Accepted Requests

An accepted request:

- Returns `accepted: true`.
- Increases the user's monthly usage.
- Increases the account's monthly usage.
- Records the decision in request history.

### Rejected Requests

A rejected request:

- Returns `accepted: false`.
- Consumes zero units.
- Records the rejected decision.
- Identifies the rule responsible for rejection.
- Identifies whether the restriction belongs to the account or user.

Possible rejection reasons include:

- `max_per_request`
- `monthly_allowance`

Possible restriction levels include:

- `account`
- `user`

### All-or-Nothing Consumption

Partial consumption is not supported.

If a request asks for five units but only three remain, the request is rejected rather than consuming three units.

This keeps consumption predictable and avoids ambiguity for calling applications.

## 10. Request Idempotency and Safe Retries

The service uses `requestId` to prevent accidental double charging.

Each request identifier is unique within an account.

### Repeating the Same Request

If the caller retries a request using the same:

- Account.
- Request identifier.
- User identifier.
- Number of units.

The service returns the original decision with:

```json
{
  "duplicate": true
}
```

The request does not consume units a second time.

### Reusing a Request Identifier with Different Data

If the same request identifier is reused with different request data, the service returns:

```http
409 Conflict
```

This prevents a previously recorded request identifier from being associated with a different operation.

### Reasoning

Network interruptions may prevent callers from receiving a successful response even when a request has already been processed.

Idempotency allows safe retries without accidentally increasing usage twice.

The demo client generates a new UUID request identifier for each new operation.

## 11. Concurrency and Data Consistency

The service uses PostgreSQL transactions to maintain consistent usage totals.

When processing consumption, the backend locks the account row using:

```sql
SELECT ... FOR UPDATE
```

This serializes concurrent consumption requests affecting the same account.

The service evaluates the applicable limits and updates usage within a database transaction.

### Why Account-Level Locking?

Different users under the same account share one account-level monthly allowance.

Without coordination, simultaneous requests could both read the same remaining allowance and incorrectly exceed the shared limit.

Account-level locking prevents this race condition by ensuring that concurrent requests are evaluated against consistent usage totals.

### Trade-off

This approach prioritizes correctness and simplicity over maximum throughput.

A heavily used account may experience additional waiting time because its consumption requests are serialized.

More advanced approaches could use carefully designed atomic counters, partitioning, or other concurrency strategies.

## 12. Monthly Usage Tracking

**Endpoint:**

```http
GET /api/usage
```

By default, the service reports usage for the current UTC month.

A specific month can be requested:

```http
GET /api/usage?month=2026-10
```

The response includes account-level and user-level usage information, such as:

- Monthly allowance.
- Units already consumed.
- Remaining units.
- Reporting period.

### Monthly Reset Behavior

Usage is stored separately by month.

When a new UTC month begins, the new reporting period starts with zero consumption.

Previous monthly records remain available for historical reporting.

No manual database reset is required.

### Month Validation

The month parameter must use the `YYYY-MM` format with a valid calendar month.

Invalid values return HTTP `400`.

Requests for a month before the account was created return HTTP `404`, with an error explaining that the account did not exist during the requested period.

### Historical Reporting Limitation

Historical consumption is preserved, but historical plan limits are not snapshotted.

This means that when viewing an earlier month's usage, the displayed allowance may reflect the currently assigned plan rather than the plan that was active during that historical month.

This is a documented limitation of the current implementation.

## 13. Request History and Pagination

**Endpoint:**

```http
GET /api/history
```

Example:

```http
GET /api/history?limit=20&offset=0
```

The history endpoint allows the authenticated account to inspect recorded consumption requests.

History includes accepted and rejected decisions.

Relevant information includes:

- Request identifier.
- User identifier.
- Requested units.
- Acceptance status.
- Rejection reason and restriction level, when applicable.
- Reporting period.
- Request timestamp.

### Pagination

History uses offset-based pagination.

The `limit` parameter determines the maximum number of records returned.

The `offset` parameter determines how many records to skip.

Records use stable ordering based on timestamp and UUID.

### Why Preserve Rejected Requests?

Rejected requests are useful for understanding quota failures, debugging integrations, and reviewing usage behavior.

They are recorded without increasing consumed units.

## 14. Automated Integration Testing

The backend includes an integration test in:

```text
backend/tests/integration.test.ts
```

The test covers:

- Missing or invalid API keys.
- Account isolation.
- Accepted consumption.
- Repeated request identifiers.
- Conflicting request identifiers.
- Concurrent consumption.
- Usage totals.
- Request history.

### Running the Tests

Start PostgreSQL using Docker Compose.

From the project root:

```powershell
docker compose up -d db
cd backend
```

Load the configured environment values:

```powershell
$config = docker compose -f ../docker-compose.yml config --format json | ConvertFrom-Json

$env:DATABASE_URL = $config.services.backend.environment.DATABASE_URL
$env:DATABASE_URL = $env:DATABASE_URL.Replace("@db:5432", "@127.0.0.1:5433")

$env:ADMIN_SECRET = $config.services.backend.environment.ADMIN_SECRET
```

Run the test suite:

```powershell
npm install
npm test
```

### Verified Local Test Result

The automated integration test was executed successfully on October 23, 2026.

| Metric | Result |
|---|---:|
| Tests | 1 |
| Passed | 1 |
| Failed | 0 |
| Cancelled | 0 |

The test creates records in the local PostgreSQL database.

### TypeScript Build Verification

To verify TypeScript compilation:

```powershell
npm run build
```

The database connection shown above uses the host port `5433` from the local Docker Compose configuration. Update it if the port mapping changes.

## 15. Manual Functional Testing

In addition to the automated integration test, the service was manually tested through its REST API and demo interface.

### Quota Enforcement

The following scenarios were verified:

- A request within both limits is accepted.
- A request exceeding the user-level per-request maximum is rejected.
- A request exceeding the account-level per-request maximum is rejected.
- A request exceeding the user-level monthly allowance is rejected.
- A request exceeding the account-level monthly allowance is rejected.
- A request consuming the exact remaining allowance is accepted.
- A subsequent request exceeding the exhausted allowance is rejected.

### Idempotency

The following scenarios were verified:

- Repeating the same request does not charge twice.
- Reusing a request identifier with different units returns HTTP `409`.
- Rejected requests appear in history without increasing usage.

### Usage and History

The following scenarios were verified:

- Account usage matches accepted consumption.
- User usage is tracked independently.
- Accepted and rejected requests are recorded.
- History pagination returns records across multiple pages.
- Monthly reporting uses the expected `YYYY-MM` period.
- Invalid month input is rejected.
- Reporting before account creation is rejected.

### Concurrency Stress Scenario

A test account with a monthly allowance of 10 units received 50 concurrent requests, each requesting one unit.

Observed results:

| Metric | Result |
|---|---:|
| Concurrent requests | 50 |
| Accepted | 10 |
| Rejected | 40 |
| Errors | 0 |
| Final account usage | 10 / 10 |

The result demonstrates that the account-level allowance was not exceeded during this test.

This is evidence of correct behavior for the tested scenario, not a guarantee of performance under every possible workload.

## 16. Performance Testing

A separate load-testing script is available at:

```text
perf/load.js
```

The script can generate multiple consumption requests and report:

- Accepted requests.
- Rejected requests.
- Errors.
- Total execution duration.
- Median latency (`p50`).
- 95th-percentile latency (`p95`).

### Run a Performance Test

From the project root, configure a test account and user:

```powershell
$env:API_KEY='quota_YOUR_KEY'
$env:USER_ID='YOUR_USER_UUID'
$env:REQUESTS='100'
$env:CONCURRENCY='10'

node perf/load.js
```

For meaningful acceptance-throughput measurements, the test account and user should have sufficiently large allowances.

Otherwise, quota rejection may dominate the results.

### Performance Results

Actual measurements should be recorded in:

```text
PERFORMANCE_RESULTS.md
```

Performance results depend on the test environment, machine specifications, database state, and concurrency settings.

No unmeasured throughput or latency figures are claimed.

## 17. Design Choices, Assumptions, and Reasoning

Some product rules were not fully specified in the project brief. The following decisions were made to keep behavior predictable, consistent, and straightforward to implement.

### 17.1 One Resource Type

**Decision:** The system measures one abstract resource in whole-number units.

**Reasoning:** A single resource type keeps the quota model clear and matches the project requirement without introducing unnecessary complexity such as different credit categories or conversion rates.

### 17.2 UTC Calendar Months

**Decision:** Monthly periods follow the server's UTC calendar.

**Reasoning:** UTC provides a consistent reference for applications operating in different time zones and avoids ambiguous monthly boundaries.

### 17.3 Positive Integer Consumption

**Decision:** Consumption requests must contain a positive whole number of units.

**Reasoning:** Negative, fractional, or zero-unit consumption would complicate quota calculations and does not represent a meaningful resource-consuming operation in this model.

### 17.4 All-or-Nothing Consumption

**Decision:** Requests are either accepted in full or rejected without consumption.

**Reasoning:** Partial acceptance would require the calling application to handle partially completed operations. Full acceptance or rejection creates a simpler and more predictable API contract.

### 17.5 Account and User Limits Apply Together

**Decision:** Every consumption request must satisfy both sets of limits.

**Reasoning:** Individual user plans should not override the application's shared resource budget.

A user with a large personal allowance cannot consume more than the account has remaining.

### 17.6 Plan Changes Preserve Usage

**Decision:** Updating or switching plans does not reset existing monthly usage.

**Reasoning:** Resetting usage during plan changes could allow accounts or users to bypass consumption restrictions.

The service applies the new limits to subsequent requests while preserving the units already recorded.

### 17.7 Immediate Plan Configuration Changes

**Decision:** Plan configuration changes take effect without redeployment.

**Reasoning:** Applications need to adjust quota rules dynamically through the API rather than requiring code changes or service restarts.

### 17.8 Idempotent Consumption Requests

**Decision:** Request identifiers are used to recognize retries.

**Reasoning:** A caller may repeat a request because of a network failure or timeout. Returning the original result avoids double charging.

### 17.9 Rejected Requests Are Recorded

**Decision:** Rejected consumption attempts remain in request history.

**Reasoning:** Recording failures helps developers understand why operations were blocked and provides a more complete account of service activity.

### 17.10 Account-Level Database Locking

**Decision:** Consumption uses database transactions and account-level row locking.

**Reasoning:** The account allowance is shared by multiple users. Locking the account during quota evaluation prevents concurrent requests from exceeding the shared limit.

### 17.11 Separate Administrative Provisioning

**Decision:** Account creation requires a separate administrative secret.

**Reasoning:** Allowing unrestricted account creation would let anyone generate new API keys and accounts. A separate secret limits provisioning privileges in the local demonstration environment.

### 17.12 Historical Usage Preservation

**Decision:** Usage records are retained when a new month begins.

**Reasoning:** Historical data supports auditing, reporting, and verification of previous consumption.

### 17.13 Reporting Before Account Creation

**Decision:** Usage requests for months before the account's creation return an error.

**Reasoning:** A period during which an account did not exist should be distinguished from an existing account that consumed zero units.

### 17.14 Simulated Downstream Operation

**Decision:** The web demo simulates image generation rather than connecting to a real AI provider.

**Reasoning:** The project's primary purpose is to implement quota management, not image generation. Simulation demonstrates the consumption workflow without external API dependencies or costs.

## 18. Known Limitations

The current implementation intentionally focuses on the required backend quota-management functionality.

Known limitations include:

- **No production-ready authentication for the demo interface.** The web interface is intended for local demonstration.
- **No API key rotation mechanism.** Production deployments would need secure key lifecycle management.
- **No rate limiting.** Additional request-rate protection would be required for a publicly exposed service.
- **No production monitoring or alerting.** Operational observability would need to be added.
- **No account deletion workflow.** Account lifecycle management is outside the current scope.
- **No refunds for downstream failures.** Accepted requests are metered when authorized, regardless of whether a later external operation succeeds.
- **No historical plan snapshots.** Historical usage is stored, but previously applied plan limits are not preserved separately.
- **No database migration framework.** The SQL schema is initialized when the Docker database volume is first created; later schema changes require migrations.
- **Offset-based history pagination.** This is simple to implement but may be less efficient for very large histories.
- **Account-level serialization.** This protects correctness but can reduce throughput for accounts receiving many simultaneous requests.
- **Single resource type.** The service does not support separate quotas for different resources.
- **No payment or billing integration.** The service tracks usage but does not charge customers.
- **No distributed architecture.** The project uses a straightforward service and database deployment.

These limitations are documented to distinguish the implemented project scope from additional production features.

## 19. Project Structure

```text
usage-metering-service/
|
|-- backend/
|   |-- src/
|   |   `-- server.ts
|   |-- tests/
|   |   `-- integration.test.ts
|   |-- Dockerfile
|   |-- package.json
|   |-- package-lock.json
|   `-- tsconfig.json
|
|-- client/
|   |-- src/
|   |   `-- server.js
|   |-- Dockerfile
|   `-- package.json
|
|-- db/
|   `-- schema.sql
|
|-- perf/
|   `-- load.js
|
|-- docker-compose.yml
|-- .env.example
|-- .gitignore
|-- PERFORMANCE_RESULTS.md
`-- README.md
```

## 20. Conclusion

The Usage Metering and Quota Service provides a working backend for managing resource consumption across applications and their users.

It combines account-level and user-level plans, configurable quota rules, authenticated API access, safe request retries, transactional consumption, concurrency protection, monthly reporting, and request history.

The service demonstrates how shared and individual quotas can be enforced consistently using TypeScript and PostgreSQL, while documenting the assumptions and trade-offs made during implementation.