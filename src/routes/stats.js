import { Router } from 'express';
import { query } from '../db.js';
import { sendError } from '../utils/errorResponse.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const [assetsStat, accessoriesStat, consumablesStat, ticketsStat] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN category = 'IT' THEN 1 ELSE 0 END) as it_total,
          SUM(CASE WHEN category = 'GA' THEN 1 ELSE 0 END) as ga_total,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
          SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned
        FROM assets
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN linked_asset_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available
        FROM accessories
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN current_stock <= min_stock_alert THEN 1 ELSE 0 END) as low_stock_count
        FROM consumables
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count
        FROM tickets
      `),
    ]);

    res.json({
      assets: assetsStat.rows[0],
      accessories: accessoriesStat.rows[0],
      consumables: consumablesStat.rows[0],
      tickets: ticketsStat.rows[0],
    });
  } catch (err) {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  }
});

export default router;
