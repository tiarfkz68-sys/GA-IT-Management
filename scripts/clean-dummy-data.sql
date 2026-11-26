-- Clean Slate Script: Hapus seluruh data dummy Aset, Aksesoris, Consumables/ATK, Maintenance, Mutasi & Tiket.
-- Master data (users, app_settings, categories, locations, employees) TETAP DIPERTAHANKAN.
BEGIN;

TRUNCATE TABLE
    maintenance_schedules,
    asset_maintenances,
    asset_user_history,
    accessories,
    consumable_checkouts,
    consumable_restocks,
    consumables,
    tickets,
    assets,
    activity_logs
RESTART IDENTITY CASCADE;

INSERT INTO activity_logs (user_name, action, target_type, target_id, details)
VALUES ('System', 'CLEAN_SLATE', 'SETTINGS', 1, 'Database dibersihkan dari data dummy untuk produksi.');

COMMIT;
