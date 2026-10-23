
# Usage Metering and Quota Service

A full-stack usage metering and quota management system built with TypeScript, Node.js, PostgreSQL, and Docker.

The service allows applications to manage subscription plans, track resource consumption, and enforce monthly usage limits at both company and user levels.

## 1. Project Requirements

The system provides:

- Company-level and user-level quota management.
- Predefined and custom subscription plans.
- Configurable monthly usage limits.
- Maximum units allowed per request.
- Real-time quota validation before consumption.
- Immediate plan configuration updates without redeployment.
- Idempotency to prevent duplicate consumption.
- Concurrency-safe usage tracking.
- Monthly usage summaries and request history.
- API key authentication.
- A web dashboard for managing and viewing data.

## 2. Subscription Plans

The system supports two types of plans.

### Predefined Plans

Four predefined plans are available:

| Plan | Type |
|---|---|
| Starter | Company |
| Pro | Company |
| Basic | User |
| Premium | User |

These plans provide ready-to-use configurations for companies and individual users.

### Custom Plans

Companies can create and configure their own plans through the API.

Each custom plan supports:

- A configurable monthly quota.
- A maximum number of units per request.
- Updates to plan settings without restarting the service.

Custom plans belong to their respective companies.

### Demo Custom Plans

The included demo dataset contains four custom plans:

| Plan | Purpose |
|---|---|
| Business Plus | Company subscription |
| Race Condition Test | Concurrency testing |
| Concurrency Test | User subscription |
| VIP User | User subscription |

### Company and User Quotas

Each company has a shared monthly allowance, while each user has an individual allowance.

A consumption request is accepted only when:

1. The requested units do not exceed the per-request limit.
2. The company has sufficient remaining quota.
3. The user has sufficient remaining quota.

Accepted requests update both applicable usage totals. Rejected requests do not consume units.

## 3. How the Service Works

1. An application sends a consumption request to the API.
2. The API authenticates the company.
3. The service validates the request and checks quota limits.
4. If the request is allowed, usage is recorded.
5. If a limit is exceeded, the request is rejected.
6. The decision is stored in the request history.

Idempotency prevents repeated requests from consuming the same units twice.

Database transactions protect quota consistency when multiple requests arrive simultaneously.

## 4. Technology Stack

| Component | Technology |
|---|---|
| Backend | Node.js, TypeScript |
| Database | PostgreSQL |
| Frontend | JavaScript, CSS, Node.js |
| Authentication | API Keys |
| Containers | Docker Compose |
| Testing | Integration Tests, k6 |

## 5. Running the Project

### Requirements

- Docker
- Docker Compose
- Git

### Clone the Repository

```bash
git clone https://github.com/janakhlaf/usage-metering-service.git
cd usage-metering-service
```

### Environment Configuration

Create a `.env` file using `.env.example` as a reference.

Configure the required database and application environment variables.

### Start the Application

```bash
docker compose up -d --build
```

### Access the Services

| Service | Address |
|---|---|
| Web Dashboard | http://localhost:8080 |
| Backend API | http://localhost:3000 |
| PostgreSQL | localhost:5433 |

The application uses PostgreSQL for persistent data storage.

## 6. Database and Demo Data

Database files:

- `db/schema.sql` — Database tables and structure.
- `db/seed/demo.sql` — Sample company, plans, users, usage, and request history.

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

**Company Plan:** Business Plus

- Monthly quota: 600 units
- Maximum per request: 20 units

**Demo Users:**

| User | Plan | Monthly Quota |
|---|---|---:|
| Test User A | Concurrency Test | 500 |
| Test User B | VIP User | 250 |

The demo includes existing consumption records and accepted/rejected request history.

### Importing Demo Data

The demo dataset is intended for a fresh, empty PostgreSQL database.

Create a new database, apply `db/schema.sql`, and then import `db/seed/demo.sql`.

Example using the Docker PostgreSQL service:

```powershell
docker compose exec db psql -U quota -d postgres -c "CREATE DATABASE quota_demo;"
```

```powershell
Get-Content .\db\schema.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U quota -d quota_demo
```

```powershell
Get-Content .\db\seed\demo.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U quota -d quota_demo
```

Run these commands from the repository root in PowerShell.

To use the imported data in the application, configure the backend database connection to point to `quota_demo`.

**Important:** Do not import the demo dataset into an existing database containing the same records.

### Demo Authentication

The demo dataset stores a SHA-256 hash of the company's API key, not the plaintext key.

The matching API key is required to access the seeded company. It is not included in this repository.

## 7. Testing

The project includes integration tests and performance testing.

Tested scenarios include:

- Successful quota consumption.
- Company and user quota enforcement.
- Per-request limit validation.
- Idempotency and duplicate request handling.
- Monthly usage summaries.
- Request history and pagination.
- Immediate plan configuration updates.
- Concurrent consumption requests.

### Concurrency Test

A test with 50 simultaneous requests produced:

| Result | Count |
|---|---:|
| Accepted | 10 |
| Rejected | 40 |
| Errors | 0 |

The test confirmed that concurrent requests did not exceed the configured quota.

### Performance Testing

The repository includes:

- `backend/tests/integration.test.ts`
- `perf/load.js`
- `PERFORMANCE_RESULTS.md`

See `PERFORMANCE_RESULTS.md` for recorded performance results.

## 8. Project Structure

```text
usage-metering-service/
├── backend/
│   ├── src/
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

## 9. Design Decisions

- **Two-Level Quotas:** Company and user limits are checked together.
- **Dynamic Plans:** Plan configurations are stored in the database and can be changed without redeployment.
- **Idempotency:** Repeated requests are handled without double-counting usage.
- **Concurrency Safety:** Database transactions protect usage totals.
- **Monthly Tracking:** Usage is organized by monthly periods.
- **Request Auditing:** Consumption decisions are recorded for review.
- **API Security:** Company API keys are stored as hashes rather than plaintext.

## 10. Project Summary

This project demonstrates a backend service for tracking usage and enforcing configurable quotas across multiple applications and users.

It combines subscription plan management, reliable usage consumption, concurrency protection, request history, and a web dashboard in a Docker-based application.

---

**Final Project — Usage Metering and Quota Service**
