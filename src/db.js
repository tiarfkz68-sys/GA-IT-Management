import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://gait_user:gait_secret_password@localhost:5432/gait_db',
});

// Helper for single query
export const query = (text, params) => pool.query(text, params);
