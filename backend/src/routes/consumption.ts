import { Router, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { randomUUID } from 'crypto';

export const consumptionRouter = Router();

export function registerConsumptionRoutes(
  wrap: (fn: any) => any,
  err: (res: Response, status: number, message: string) => any,
  account: (res: Response) => any,
  tx: <T>(fn: (c: PoolClient) => Promise<T>) => Promise<T>,
  period: () => string,
  uuid: (value: any) => boolean,
  positive: (value: any) => boolean,
  text: (value: any) => boolean
) {
consumptionRouter.post('/', wrap(async (
  req: Request,
  res: Response
) => {
  const { userId, units, requestId } = req.body;

  if (
    !uuid(userId) ||
    !positive(units) ||
    !text(requestId)
  ) {
    return err(
      res,
      400,
      'Valid userId, positive integer units, requestId required'
    );
  }

  const aid = account(res).id;

  const result = await tx(async c => {
    const a = await c.query(
      `SELECT a.id, a.plan_id,
              p.monthly_limit, p.max_per_request
       FROM accounts a
       JOIN plans p ON p.id = a.plan_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [aid]
    );

    const existing = await c.query(
      `SELECT * FROM requests
       WHERE account_id = $1 AND request_id = $2`,
      [aid, requestId]
    );

    if (existing.rowCount) {
      const old = existing.rows[0];

      if (
        old.user_id !== userId ||
        old.units !== units
      ) {
        return {
          status: 409,
          body: {
            error: 'requestId already used with different payload'
          }
        };
      }

      return {
        status: 200,
        body: {
          accepted: old.accepted,
          reason: old.reason,
          level: old.level,
          requestId,
          duplicate: true
        }
      };
    }

    const u = await c.query(
      `SELECT u.id, u.plan_id,
              p.monthly_limit, p.max_per_request
       FROM app_users u
       JOIN plans p ON p.id = u.plan_id
       WHERE u.id = $1 AND u.account_id = $2`,
      [userId, aid]
    );

    if (!u.rowCount) {
      return {
        status: 404,
        body: { error: 'User not found in this account' }
      };
    }

    const month = period();

    const usage = await c.query(
      `SELECT user_id, units
       FROM usage_totals
       WHERE account_id = $1 AND period = $2`,
      [aid, month]
    );

    const accountUsed = usage.rows
      .filter(x => x.user_id === null)
      .reduce((s, x) => s + x.units, 0);

    const userUsed = usage.rows
      .filter(x => x.user_id === userId)
      .reduce((s, x) => s + x.units, 0);

    const ap = a.rows[0];
    const up = u.rows[0];

    let reason: string | null = null;
    let level: string | null = null;

    if (units > up.max_per_request) {
      reason = 'max_per_request';
      level = 'user';
    } else if (units > ap.max_per_request) {
      reason = 'max_per_request';
      level = 'account';
    } else if (userUsed + units > up.monthly_limit) {
      reason = 'monthly_allowance';
      level = 'user';
    } else if (accountUsed + units > ap.monthly_limit) {
      reason = 'monthly_allowance';
      level = 'account';
    }

    const accepted = reason === null;

    await c.query(
      `INSERT INTO requests
       (id, account_id, user_id, request_id,
        units, accepted, reason, level, period)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        aid,
        userId,
        requestId,
        units,
        accepted,
        reason,
        level,
        month
      ]
    );

    if (accepted) {
      await c.query(
        `INSERT INTO usage_totals
         (id, account_id, user_id, period, units)
         VALUES ($1,$2,NULL,$3,$4)
         ON CONFLICT (account_id,period)
         WHERE user_id IS NULL
         DO UPDATE SET
           units = usage_totals.units + EXCLUDED.units`,
        [randomUUID(), aid, month, units]
      );

      await c.query(
        `INSERT INTO usage_totals
         (id, account_id, user_id, period, units)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (account_id,user_id,period)
         WHERE user_id IS NOT NULL
         DO UPDATE SET
           units = usage_totals.units + EXCLUDED.units`,
        [randomUUID(), aid, userId, month, units]
      );
    }

    return {
      status: 200,
      body: {
        accepted,
        reason,
        level,
        requestId,
        duplicate: false,
        period: month,
        userRemaining: Math.max(
          0,
          up.monthly_limit - userUsed -
          (accepted ? units : 0)
        ),
        accountRemaining: Math.max(
          0,
          ap.monthly_limit - accountUsed -
          (accepted ? units : 0)
        )
      }
    };
  });

  res.status(result.status).json(result.body);
}));
}

