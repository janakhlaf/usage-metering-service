
import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';

export const usageRouter = Router();

export function registerUsageRoutes(
  db: Pool,
  wrap: (fn: any) => any,
  err: (res: Response, status: number, message: string) => any,
  account: (res: Response) => any,
  period: () => string
) {
  usageRouter.get('/', wrap(async (
    req: Request,
    res: Response
  ) => {
    const aid = account(res).id;

    const month =
      typeof req.query.month === 'string'
        ? req.query.month
        : period();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return err(res, 400, 'month must be YYYY-MM');
    }

    const a = await db.query(
      `SELECT p.monthly_limit, a.created_at
       FROM accounts a
       JOIN plans p ON p.id = a.plan_id
       WHERE a.id = $1`,
      [aid]
    );

    const createdMonth = new Date(a.rows[0].created_at)
      .toISOString()
      .slice(0, 7);

    if (month < createdMonth) {
      return err(
        res,
        404,
        'Account did not exist in the requested period'
      );
    }

    const currentMonth = new Date().toISOString().slice(0, 7);

    if (month > currentMonth) {
      return err(
        res,
        400,
        'Cannot view usage for a future month'
      );
    }

    const total = await db.query(
      `SELECT COALESCE(SUM(units),0)::int AS used
       FROM usage_totals
       WHERE account_id = $1
         AND period = $2
         AND user_id IS NULL`,
      [aid, month]
    );

    const users = await db.query(
      `SELECT u.id, u.name, p.monthly_limit,
              COALESCE(t.units,0)::int AS used
       FROM app_users u
       JOIN plans p ON p.id = u.plan_id
       LEFT JOIN usage_totals t
         ON t.user_id = u.id AND t.period = $2
       WHERE u.account_id = $1
       ORDER BY u.created_at`,
      [aid, month]
    );

    const used = total.rows[0].used;

    res.json({
      period: month,
      account: {
        used,
        monthlyLimit: a.rows[0].monthly_limit,
        remaining: Math.max(
          0,
          a.rows[0].monthly_limit - used
        )
      },
      users: users.rows.map(u => ({
        id: u.id,
        name: u.name,
        used: u.used,
        monthlyLimit: u.monthly_limit,
        remaining: Math.max(
          0,
          u.monthly_limit - u.used
        )
      }))
    });
  }));
}
