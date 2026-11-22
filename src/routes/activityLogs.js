import { Router } from 'express';
import { query } from '../db.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const result = await query(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT $1`, [limit]);
    res.json(result.rows);
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
