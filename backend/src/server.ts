import express, {
  Request,
  Response,
  NextFunction
} from 'express';

import type { Pool, PoolClient } from 'pg';
import { db } from './db/database';
import {
  historyRouter,
  registerHistoryRoutes
} from './routes/history';
import {
  usageRouter,
  registerUsageRoutes
} from './routes/usage';
import {
  consumptionRouter,
  registerConsumptionRoutes
} from './routes/consumption';

import {
  randomUUID,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual
} from 'crypto';

const app = express();
app.use(express.json({ limit: '32kb' }));


const hash = (s: string) =>
  createHash('sha256').update(s).digest('hex');

const uuid = (s: any) =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const positive = (v: any) =>
  Number.isSafeInteger(v) && v > 0 && v <= 2147483647;

const nonnegative = (v: any) =>
  Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;

const text = (v: any) =>
  typeof v === 'string' &&
  v.trim().length > 0 &&
  v.length <= 120;

const err = (
  res: Response,
  status: number,
  message: string
) => res.status(status).json({ error: message });

const wrap = (fn: any) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const period = () => new Date().toISOString().slice(0, 7);

async function tx<T>(
  fn: (c: PoolClient) => Promise<T>
): Promise<T> {
  const c = await db.connect();

  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function init() {
  await db.query('SELECT 1');

  for (
    const [scope, name, monthly, max] of [
      ['account', 'Starter', 100, 20],
      ['account', 'Pro', 1000, 100],
      ['user', 'Basic', 10, 5],
      ['user', 'Premium', 100, 20]
    ] as const
  ) {
    await db.query(
      `INSERT INTO plans
       (id, owner_account_id, scope, name,
        monthly_limit, max_per_request, predefined)
       SELECT $1, NULL, $2, $3, $4, $5, true
       WHERE NOT EXISTS (
         SELECT 1 FROM plans
         WHERE owner_account_id IS NULL
           AND scope = $2
           AND name = $3
       )`,
      [randomUUID(), scope, name, monthly, max]
    );
  }
}

app.get('/health', wrap(async (_req: Request, res: Response) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok' });
}));

// --------------------------------------------------
// ADMIN AUTHENTICATION
// --------------------------------------------------

const demoEnabled = () =>
  process.env.DEMO_MODE === 'true';

const adminSecret = () =>
  process.env.ADMIN_SECRET || '';

function validAdmin(req: Request) {
  const secret = adminSecret();
  const given = req.header('x-admin-secret') || '';

  return !!secret &&
    given.length === secret.length &&
    timingSafeEqual(
      Buffer.from(given),
      Buffer.from(secret)
    );
}

// --------------------------------------------------
// CREATE COMPANY
// --------------------------------------------------

app.post('/admin/accounts', wrap(async (
  req: Request,
  res: Response
) => {
  if (!validAdmin(req)) {
    return err(res, 401, 'Invalid admin secret');
  }

  if (!text(req.body.name)) {
    return err(res, 400, 'Valid name required');
  }

  const key = 'quota_' + randomBytes(24).toString('hex');
  const id = randomUUID();

  const plan = await db.query(
    `SELECT id FROM plans
     WHERE predefined = true
       AND scope = 'account'
       AND name = 'Starter'`
  );

  await db.query(
    `INSERT INTO accounts
     (id, name, api_key_hash, plan_id)
     VALUES ($1, $2, $3, $4)`,
    [id, req.body.name, hash(key), plan.rows[0].id]
  );

  res.status(201).json({
    id,
    name: req.body.name,
    apiKey: key,
    note: 'Store API key securely; shown only once'
  });
}));

// --------------------------------------------------
// LIST ALL COMPANIES - DEMO ADMIN ONLY
// --------------------------------------------------

app.get('/admin/demo/accounts', wrap(async (
  req: Request,
  res: Response
) => {
  if (!demoEnabled()) {
    return err(res, 404, 'Not found');
  }

  if (!validAdmin(req)) {
    return err(res, 401, 'Invalid admin secret');
  }

  const result = await db.query(
    `SELECT a.id, a.name, p.name AS plan_name,
            COUNT(u.id)::int AS user_count
     FROM accounts a
     JOIN plans p ON p.id = a.plan_id
     LEFT JOIN app_users u ON u.account_id = a.id
     GROUP BY a.id, a.name, p.name
     ORDER BY a.name, a.id`
  );

  res.json(result.rows);
}));

// --------------------------------------------------
// TEMPORARY DEMO ACCESS TOKEN
// --------------------------------------------------

function demoSignature(id: string, expires: number) {
  return createHmac('sha256', adminSecret())
    .update(`${id}.${expires}`)
    .digest('hex');
}

app.post('/admin/demo/accounts/:id/token', wrap(async (
  req: Request,
  res: Response
) => {
  if (!demoEnabled()) {
    return err(res, 404, 'Not found');
  }

  if (!validAdmin(req)) {
    return err(res, 401, 'Invalid admin secret');
  }

  if (!uuid(req.params.id)) {
    return err(res, 400, 'Invalid company id');
  }

  const result = await db.query(
    'SELECT id FROM accounts WHERE id = $1',
    [req.params.id]
  );

  if (!result.rowCount) {
    return err(res, 404, 'Company not found');
  }

  const expires = Date.now() + 60 * 60 * 1000;

  const demoToken = [
    req.params.id,
    expires,
    demoSignature(req.params.id, expires)
  ].join('.');

      res.json({
      demoToken,
      expiresAt: expires
    });
  })
);

// --------------------------------------------------
// API AUTHENTICATION
// --------------------------------------------------

app.use('/api', wrap(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const key = req.header('x-api-key');

  let result;

  if (key) {
    result = await db.query(
      `SELECT id, name, plan_id
       FROM accounts
       WHERE api_key_hash = $1`,
      [hash(key)]
    );
  } else {
    const token = req.header('x-demo-token') || '';

    if (
      !demoEnabled() ||
      !adminSecret() ||
      !token
    ) {
      return err(res, 401, 'Missing API key');
    }

    const parts = token.split('.');

    if (
      parts.length !== 3 ||
      !uuid(parts[0]) ||
      !/^\d{13}$/.test(parts[1])
    ) {
      return err(res, 401, 'Invalid demo token');
    }

    const expires = Number(parts[1]);

    if (
      !Number.isSafeInteger(expires) ||
      expires <= Date.now() ||
      expires > Date.now() + 60 * 60 * 1000
    ) {
      return err(res, 401, 'Expired demo token');
    }

    const expected = demoSignature(parts[0], expires);

    if (
      parts[2].length !== expected.length ||
      !timingSafeEqual(
        Buffer.from(parts[2]),
        Buffer.from(expected)
      )
    ) {
      return err(res, 401, 'Invalid demo token');
    }

    result = await db.query(
      `SELECT id, name, plan_id
       FROM accounts
       WHERE id = $1`,
      [parts[0]]
    );
  }

  if (!result.rowCount) {
    return err(res, 401, 'Invalid credentials');
  }

  res.locals.account = result.rows[0];
  next();
}));

const account = (res: Response) =>
  res.locals.account;

async function planFor(
  c: PoolClient | Pool,
  accountId: string,
  planId: string,
  scope: string
) {
  const result = await c.query(
    `SELECT * FROM plans
     WHERE id = $1
       AND scope = $2
       AND (
         predefined = true OR
         owner_account_id = $3
       )`,
    [planId, scope, accountId]
  );

  return result.rows[0];
}

// --------------------------------------------------
// PLANS
// --------------------------------------------------

app.get('/api/plans', wrap(async (
  _req: Request,
  res: Response
) => {
  const result = await db.query(
    `SELECT id, scope, name, monthly_limit,
            max_per_request, predefined
     FROM plans
     WHERE predefined = true OR owner_account_id = $1
     ORDER BY scope, name`,
    [account(res).id]
  );

  res.json(result.rows);
}));

app.post('/api/plans', wrap(async (
  req: Request,
  res: Response
) => {
  const {
    name,
    scope,
    monthlyLimit,
    maxPerRequest
  } = req.body;

  if (
    !text(name) ||
    !['account', 'user'].includes(scope) ||
    !nonnegative(monthlyLimit) ||
    !positive(maxPerRequest)
  ) {
    return err(res, 400, 'Invalid plan');
  }

  const id = randomUUID();

  try {
    await db.query(
      `INSERT INTO plans
       (id, owner_account_id, scope, name,
        monthly_limit, max_per_request)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        account(res).id,
        scope,
        name,
        monthlyLimit,
        maxPerRequest
      ]
    );

    res.status(201).json({
      id,
      name,
      scope,
      monthlyLimit,
      maxPerRequest
    });
  } catch (e: any) {
    if (e.code === '23505') {
      return err(res, 409, 'Plan name already exists');
    }

    throw e;
  }
}));

app.patch('/api/plans/:id', wrap(async (
  req: Request,
  res: Response
) => {
  const { monthlyLimit, maxPerRequest } = req.body;

  if (
    !nonnegative(monthlyLimit) ||
    !positive(maxPerRequest)
  ) {
    return err(res, 400, 'Invalid limits');
  }

  const result = await db.query(
    `UPDATE plans
     SET monthly_limit = $1,
         max_per_request = $2
     WHERE id = $3
       AND owner_account_id = $4
       AND predefined = false
     RETURNING *`,
    [
      monthlyLimit,
      maxPerRequest,
      req.params.id,
      account(res).id
    ]
  );

  if (!result.rowCount) {
    return err(res, 404, 'Custom plan not found');
  }

  res.json(result.rows[0]);
}));

// --------------------------------------------------
// ACCOUNT
// --------------------------------------------------

app.get('/api/account', wrap(async (
  _req: Request,
  res: Response
) => {
  const result = await db.query(
    `SELECT a.id, a.name, a.plan_id,
            p.name AS plan_name,
            p.monthly_limit, p.max_per_request
     FROM accounts a
     JOIN plans p ON p.id = a.plan_id
     WHERE a.id = $1`,
    [account(res).id]
  );

  res.json(result.rows[0]);
}));

app.patch('/api/account/plan', wrap(async (
  req: Request,
  res: Response
) => {
  if (!uuid(req.body.planId)) {
    return err(res, 400, 'Invalid planId');
  }

  if (!await planFor(
    db,
    account(res).id,
    req.body.planId,
    'account'
  )) {
    return err(res, 404, 'Plan not available');
  }

  await db.query(
    'UPDATE accounts SET plan_id = $1 WHERE id = $2',
    [req.body.planId, account(res).id]
  );

  res.json({ planId: req.body.planId });
}));

// --------------------------------------------------
// USERS
// --------------------------------------------------

app.post('/api/users', wrap(async (
  req: Request,
  res: Response
) => {
  if (
    !text(req.body.name) ||
    !uuid(req.body.planId)
  ) {
    return err(res, 400, 'Valid name and planId required');
  }

  if (!await planFor(
    db,
    account(res).id,
    req.body.planId,
    'user'
  )) {
    return err(res, 404, 'Plan not available');
  }

  const id = randomUUID();

  await db.query(
    `INSERT INTO app_users
     (id, account_id, name, plan_id)
     VALUES ($1, $2, $3, $4)`,
    [
      id,
      account(res).id,
      req.body.name,
      req.body.planId
    ]
  );

  res.status(201).json({
    id,
    name: req.body.name,
    planId: req.body.planId
  });
}));

app.get('/api/users', wrap(async (
  _req: Request,
  res: Response
) => {
  const result = await db.query(
    `SELECT u.id, u.name, u.plan_id,
            p.name AS plan_name,
            p.monthly_limit, p.max_per_request
     FROM app_users u
     JOIN plans p ON p.id = u.plan_id
     WHERE u.account_id = $1
     ORDER BY u.created_at`,
    [account(res).id]
  );

  res.json(result.rows);
}));

app.patch('/api/users/:id/plan', wrap(async (
  req: Request,
  res: Response
) => {
  if (!uuid(req.body.planId)) {
    return err(res, 400, 'Invalid planId');
  }

  if (!await planFor(
    db,
    account(res).id,
    req.body.planId,
    'user'
  )) {
    return err(res, 404, 'Plan not available');
  }

  const result = await db.query(
    `UPDATE app_users
     SET plan_id = $1
     WHERE id = $2 AND account_id = $3
     RETURNING id`,
    [
      req.body.planId,
      req.params.id,
      account(res).id
    ]
  );

  if (!result.rowCount) {
    return err(res, 404, 'User not found');
  }

  res.json({
    id: req.params.id,
    planId: req.body.planId
  });
}));

// CONSUMPTION ROUTES
registerConsumptionRoutes(
  wrap,
  err,
  account,
  tx,
  period,
  uuid,
  positive,
  text
);

app.use('/api/consume', consumptionRouter);

// USAGE ROUTES
registerUsageRoutes(db, wrap, err, account, period);
app.use('/api/usage', usageRouter);

registerHistoryRoutes(wrap, err, account);
app.use('/api/history', historyRouter);

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((
  e: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(e);

  res.status(500).json({
    error: 'Internal server error'
  });
});

if (require.main === module) {
  init()
    .then(() => {
      app.listen(
        Number(process.env.PORT) || 3000,
        '0.0.0.0',
        () => console.log('Quota API ready')
      );
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

export { app, init, db };