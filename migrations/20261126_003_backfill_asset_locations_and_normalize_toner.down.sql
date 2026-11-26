-- Migration 003 (DOWN): Clear backfilled location_id on assets that still rely on default location text
-- Note: Category normalization ('toner' -> 'printer_supplies') is semantic-preserving; no reverse data loss.
UPDATE assets SET location_id = NULL WHERE location_id IS NOT NULL AND location = 'Head Office';
