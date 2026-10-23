CREATE TABLE IF NOT EXISTS accounts (
 id UUID PRIMARY KEY, name TEXT NOT NULL, api_key_hash TEXT NOT NULL UNIQUE,
 plan_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS plans (
 id UUID PRIMARY KEY, owner_account_id UUID REFERENCES accounts(id), scope TEXT NOT NULL CHECK(scope IN ('account','user')),
 name TEXT NOT NULL, monthly_limit INTEGER NOT NULL CHECK(monthly_limit >= 0),
 max_per_request INTEGER NOT NULL CHECK(max_per_request > 0),
 predefined BOOLEAN NOT NULL DEFAULT false,
 UNIQUE(owner_account_id, scope, name)
);
ALTER TABLE accounts ADD CONSTRAINT account_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id);
CREATE TABLE IF NOT EXISTS app_users (
 id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts(id), name TEXT NOT NULL,
 plan_id UUID NOT NULL REFERENCES plans(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_account_idx ON app_users(account_id);
CREATE TABLE IF NOT EXISTS usage_totals (
 account_id UUID NOT NULL REFERENCES accounts(id), user_id UUID REFERENCES app_users(id),
 period TEXT NOT NULL, units INTEGER NOT NULL DEFAULT 0 CHECK(units >= 0),
 id UUID PRIMARY KEY, UNIQUE(account_id,user_id,period)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_usage_period_idx ON usage_totals(account_id,period) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_usage_period_idx ON usage_totals(account_id,user_id,period) WHERE user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS requests (
 id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts(id), user_id UUID NOT NULL REFERENCES app_users(id),
 request_id TEXT NOT NULL, units INTEGER NOT NULL, accepted BOOLEAN NOT NULL,
 reason TEXT, level TEXT, period TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(account_id,request_id)
);
CREATE INDEX IF NOT EXISTS requests_history_idx ON requests(account_id,created_at DESC);
