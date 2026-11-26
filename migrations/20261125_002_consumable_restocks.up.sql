-- Migration 002 (UP): Consumable Restocks History Table
CREATE TABLE IF NOT EXISTS consumable_restocks (
    id SERIAL PRIMARY KEY,
    consumable_id INT NOT NULL REFERENCES consumables(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    notes TEXT,
    restocked_by VARCHAR(100),
    restock_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consumable_restocks_date ON consumable_restocks(restock_date);
CREATE INDEX IF NOT EXISTS idx_consumable_checkouts_date ON consumable_checkouts(checkout_date);
