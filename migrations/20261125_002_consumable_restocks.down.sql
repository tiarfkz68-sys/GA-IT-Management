-- Migration 002 (DOWN): Rollback Consumable Restocks History Table
DROP INDEX IF EXISTS idx_consumable_checkouts_date;
DROP INDEX IF EXISTS idx_consumable_restocks_date;
DROP TABLE IF EXISTS consumable_restocks;
