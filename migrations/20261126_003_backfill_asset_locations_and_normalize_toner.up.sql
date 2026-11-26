-- Migration 003 (UP): Backfill legacy assets.location_id and normalize legacy 'toner' category
-- Non-destructive Expand/Migrate step: keeps assets.location column intact for backward compatibility.

UPDATE assets a
SET location_id = COALESCE(
    (SELECT l.id FROM locations l WHERE LOWER(l.name) = LOWER(a.location) LIMIT 1),
    (SELECT l.id FROM locations l WHERE l.name ILIKE '%' || COALESCE(NULLIF(TRIM(a.location), ''), 'Head Office') || '%' ORDER BY l.id ASC LIMIT 1),
    (SELECT l.id FROM locations l ORDER BY l.id ASC LIMIT 1)
)
WHERE a.location_id IS NULL;

UPDATE consumables
SET category = 'printer_supplies'
WHERE category = 'toner';
