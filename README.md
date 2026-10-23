
# Usage Metering and Quota Service

A usage metering and quota management service built with **TypeScript, Node.js, PostgreSQL, and Docker**.

The service allows applications to manage subscription plans, track resource consumption, and enforce usage limits for both companies and individual users.

It includes a REST API, PostgreSQL database, web dashboard, integration tests, and performance testing.

## 1. Project Overview

An application can use this service to decide whether a user is allowed to consume a certain number of units.

Every consumption request is checked against:

- The company's monthly quota.
- The user's monthly quota.
- The maximum units allowed per request.

The service records the decision and updates usage only when the request is accepted.

## 2. Core Features

- Company and user quota management.
- Predefined and custom subscription plans.
- Configurable monthly limits and per-request limits.
- Dynamic plan configuration without redeployment.
- API key authentication.
- Atomic quota consumption.
- Idempotency protection.
- Concurrency-safe database operations.
- Monthly usage tracking.
- Accepted and rejected request history.
- Web dashboard for viewing and managing data.

## 3. Subscription Plans

The system supports predefined plans and company-owned custom plans.

### Predefined Plans

| Scope | Plans |
|---|---|
| Company | Starter, Pro |
| User | Basic, Premium |

Predefined plans provide ready-to-use configurations.

### Custom Plans

Companies can create their own plans through the API and configure:

- Monthly quota.
- Maximum units per request.
- Plan assignments and settings.

Plan changes take effect without restarting the application.

The demo includes these custom plans:

| Plan | Purpose |
|---|---|
| Business Plus | Company subscription |
| Race Condition Test | Concurrency testing |
| Concurrency Test | User subscription |
| VIP User | User subscription |

### Two-Level Quota Enforcement

Each company has a shared monthly allowance, and each user has an individual allowance.

A request must satisfy both levels. This prevents one user from exceeding their personal limit and prevents all users together from exceeding the company's shared limit.

## 4. Business Rules and Assumptions

Some product behavior was intentionally unspecified in the project brief. The following decisions explain the implemented quota model and its reasoning.

### Quota Validation

A request is accepted only when the requested units fit within the applicable company quota, user quota, and per-request limits.

**Reason:** Both shared and individual allowances must be protected.

### Rejected Requests

Rejected requests are recorded but do not increase consumed usage.

**Reason:** Only successful consumption should reduce the available allowance.

### Idempotency

Repeated requests using the same idempotency key must not consume units multiple times.

**Reason:** Applications may retry requests because of timeouts or network failures. Retrying should not cause duplicate billing or usage.

### Concurrency

Consumption operations must remain safe when multiple requests arrive simultaneously.

**Reason:** Checking and updating usage without concurrency protection could allow requests to exceed quota limits.

### Dynamic Plan Changes

Plan settings are stored in PostgreSQL and can be updated through the API without redeploying the service.

**Reason:** Applications need to change subscription configurations while the service remains available.

Existing usage is tracked separately from plan configuration, so changing a quota does not itself erase recorded consumption.

### Monthly Usage Periods

Usage is tracked by month, allowing the service to evaluate the current period independently of previous months.

**Reason:** Subscription allowances generally apply to defined billing or usage periods.

### Request History

Accepted and rejected requests are retained for auditing and troubleshooting.

**Reason:** Applications need to understand why consumption was allowed or denied.

### Invalid Requests

Invalid input, authentication failures, and unavailable resources should return appropriate error responses rather than consuming usage.

**Reason:** Invalid operations must not modify quota totals.

## 5. API and Authentication

The backend exposes REST endpoints for managing accounts, plans, users, usage, and consumption.

Company API keys are used to authenticate API requests.

Example request header:

```http
x-api-key: YOUR_COMPANY_API_KEY
```

API keys are stored as SHA-256 hashes in the database rather than plaintext.

### Main API Capabilities

| Area | Operations |
|---|---|
| Companies | Create and manage company accounts |
| Plans | Use predefined plans and configure custom plans |
| Users | Manage users and their assigned plans |
| Consumption | Validate and consume usage units |
| Usage | Retrieve monthly usage information |
| History | Review consumption decisions and request records |
| Dashboard | View companies, users, plans, and usage |

Consumption requests use idempotency protection to avoid duplicate usage when retried.

## 6. Technology Stack

| Component | Technology |
|---|---|
| Backend | Node.js, TypeScript |
| Database | PostgreSQL |
| Frontend | Node.js, JavaScript, CSS |
| Authentication | API Keys |
| Containerization | Docker Compose |
| Testing | Integration Tests, k6 |

## 7. Installation and Setup

### Requirements

- Docker
- Docker Compose
- Git

### Clone the Repository

```bash
git clone https://github.com/janakhlaf/usage-metering-service.git
cd usage-metering-service
```

### Environment Variables

Use `.env.example` as a reference for the required environment configuration.

Do not commit real API keys, passwords, or other secrets.

### Start the Application

```bash
docker compose up -d --build
```

### Local Services

| Service | URL |
|---|---|
| Web Dashboard | http://localhost:8080 |
| Backend API | http://localhost:3000 |
| PostgreSQL | localhost:5433 |

## 8. Database and Demo Data

The repository includes:

- `db/schema.sql` — Database schema.
- `db/seed/demo.sql` — Demo dataset.
- `db/seed/build-demo.ps1` — Demo seed generation script.

### Demo Dataset

| Data | Count |
|---|---:|
| Companies | 1 |
| Plans | 8 |
| Users | 2 |
| Usage Records | 3 |
| Requests | 24 |

### Demo Company

**Company:** API Key Test Company

**Assigned plan:** Business Plus

| Setting | Value |
|---|---:|
| Monthly quota | 600 units |
| Maximum per request | 20 units |

**Demo users:**

| User | Assigned Plan | Monthly Quota |
|---|---|---:|
| Test User A | Concurrency Test | 500 |
| Test User B | VIP User | 250 |

The dataset includes previously recorded usage and consumption requests.

### Import Demo Data

The demo data was successfully imported and verified in a separate PostgreSQL test database.

The following PowerShell commands create and populate a fresh demo database.

Run them from the repository root after starting Docker.

**1. Create the database:**

```powershell
docker compose exec db psql -U quota -d postgres -c "CREATE DATABASE quota_demo;"
```

**2. Apply the schema:**

```powershell
Get-Content .\db\schema.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U quota -d quota_demo
```

**3. Import the demo dataset:**

```powershell
Get-Content .\db\seed\demo.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U quota -d quota_demo
```

**4. Verify imported records:**

```powershell
docker compose exec db psql -U quota -d quota_demo -c "SELECT COUNT(*) FROM accounts;"
```

To display this dataset in the application, configure the backend to connect to `quota_demo` instead of its default database.

Do not import the seed into a database already containing the same records.

### Demo API Key

The seed includes the SHA-256 hash of the demo company's API key.

The matching plaintext key is not included in the repository. It must be supplied separately to authenticate as the seeded company.

## 9. Testing and Reliability

The project includes integration and performance tests covering:

- Successful quota consumption.
- Company-level and user-level limits.
- Maximum units per request.
- Idempotency.
- Monthly usage tracking.
- Request history and pagination.
- Dynamic plan updates.
- Concurrent requests.

### Concurrency Test

A test with 50 simultaneous requests produced:

| Result | Count |
|---|---:|
| Accepted | 10 |
| Rejected | 40 |
| Errors | 0 |

The test demonstrated that concurrent requests did not exceed the configured quota.

### Test Files

- `backend/tests/integration.test.ts`
- `perf/load.js`
- `PERFORMANCE_RESULTS.md`

See `PERFORMANCE_RESULTS.md` for the recorded performance test results.

## 10. Project Structure

```text
usage-metering-service/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   ├── routes/
│   │   └── server.ts
│   └── tests/
├── client/
│   └── src/
├── db/
│   ├── schema.sql
│   └── seed/
│       ├── demo.sql
│       └── build-demo.ps1
├── perf/
│   └── load.js
├── docker-compose.yml
├── .env.example
├── PERFORMANCE_RESULTS.md
└── README.md
```

## 11. Key Design Decisions

| Decision | Reason |
|---|---|
| PostgreSQL | Persistent storage and transactional consistency |
| Separate company and user quotas | Enforce shared and individual allowances |
| Database-backed plan configuration | Allow updates without redeployment |
| Idempotency protection | Prevent duplicate consumption on retries |
| Transactional consumption | Protect quotas during concurrent requests |
| Monthly usage records | Separate usage by period |
| Request history | Support auditing and troubleshooting |
| Docker Compose | Simplify local deployment and evaluation |

## 12. Conclusion

The Usage Metering and Quota Service provides a configurable backend for managing subscription plans, enforcing usage limits, and recording resource consumption.

It demonstrates API development, database design, quota enforcement, idempotency, concurrency handling, testing, and containerized deployment.

---

**Foothill Final Project — Usage Metering and Quota Service**
