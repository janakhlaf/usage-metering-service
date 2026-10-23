import { Router, Request, Response } from 'express';
import { db } from '../db/database';

export const historyRouter = Router();

export function registerHistoryRoutes(
  wrap: (fn: any) => any,
  err: (res: Response, status: number, message: string) => Response,
  account: (res: Response) => { id: string }
) {
  historyRouter.get('/', wrap(async (
    _req: Request,
    res: Response
  ) => {
    const req = _req;

    const limit = Math.min(
      100,
      Math.max(1, Number(req.query.limit) || 20)
    );

    const offset = Math.max(
      0,
      Number(req.query.offset) || 0
    );

    if (
      !Number.isSafeInteger(limit) ||
      !Number.isSafeInteger(offset)
    ) {
      return err(res, 400, 'Invalid pagination');
    }

    const result = await db.query(
      `SELECT request_id, user_id, units,
              accepted, reason, level,
              period, created_at
       FROM requests
       WHERE account_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [account(res).id, limit, offset]
    );

    res.json({
      items: result.rows,
      limit,
      offset
    });
  }));
}