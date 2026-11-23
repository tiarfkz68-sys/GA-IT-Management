# Performance Benchmarks & Budgets

This document records baseline measurements, optimizations applied, before/after results, and performance budgets for the **GA & IT Operations Management Portal**.

## 1. Performance Budgets

| Metric | Target Budget | Current Measured | Status |
| :--- | :---: | :---: | :---: |
| **API Response Time (p95)** | $\le 200\text{ ms}$ | $\le 28.81\text{ ms}$ | PASS (Good) |
| **HTML Bundle (Gzip)** | $\le 100\text{ KB}$ | $77.39\text{ KB}$ | PASS (Good) |
| **Cold Asset Endpoint Latency** | $\le 100\text{ ms}$ | $9.24\text{ ms}$ | PASS (Good) |
| **Static Repeat Visit (304 Cache)** | $\le 5\text{ ms}$ | $\le 2.00\text{ ms}$ | PASS (Good) |
| **PostgreSQL Planner Cost (Assets)** | $\le 100.00$ | $38.02$ | PASS (Good) |

---

## 2. Before & After Optimization Ledger

Benchmarked under identical hardware and network conditions across 10 request samples per endpoint:

| Endpoint / Asset | Baseline (Before) | Optimized (After) | Delta (%) | Optimization Technique |
| :--- | :---: | :---: | :---: | :--- |
| **Root `/` (Gzip Payload)** | 241.90 KB | **77.39 KB** | **-68.0%** | Express `compression` middleware (Gzip level 6) |
| **Root `/` (Cold TTFB)** | 1,306.68 ms | **20.04 ms** | **-98.5%** | Preconnect hints, connection pool warmup |
| **Root `/` (Warm p95 Latency)** | 49.13 ms | **28.81 ms** | **-41.4%** | Static ETag caching + Gzip compression |
| **`/api/assets` (Cold Latency)** | 77.98 ms | **9.24 ms** | **-88.2%** | PostgreSQL foreign key & composite indexes |
| **`/api/assets` (p95 Latency)** | 25.53 ms | **14.96 ms** | **-41.4%** | Index scan replacing full table sequential scans |
| **`/api/stats/overview` (Avg)** | 5.99 ms | **3.83 ms** | **-36.1%** | Connection pool tuning (`max: 20`, `timeout: 5s`) |
| **`/api/consumables` (p95)** | 25.02 ms | **9.14 ms** | **-63.5%** | Index on `consumable_checkouts(consumable_id)` |
| **`/api/categories` (Warm Avg)** | 10.36 ms | **5.38 ms** | **-48.1%** | In-memory 60s TTL cache with event invalidation |
| **Database Planner Cost** | 2,209.32 | **38.02** | **-98.3%** | B-tree indexes on foreign keys & order columns |

---

## 3. Database Indexes Added

The following PostgreSQL indexes are maintained in `init.sql`:

1. `idx_accessories_linked_asset`: `ON accessories(linked_asset_id) WHERE linked_asset_id IS NOT NULL`
2. `idx_asset_maint_asset_id`: `ON asset_maintenances(asset_id)`
3. `idx_asset_history_asset_id`: `ON asset_user_history(asset_id, created_at DESC)`
4. `idx_assets_assigned_to`: `ON assets(assigned_to_user_id)`
5. `idx_assets_status_cat`: `ON assets(status, category)`
6. `idx_assets_created_at`: `ON assets(created_at DESC)`
7. `idx_tickets_status`: `ON tickets(status, created_at DESC)`
8. `idx_tickets_related_asset`: `ON tickets(related_asset_id) WHERE related_asset_id IS NOT NULL`
9. `idx_activity_logs_created`: `ON activity_logs(created_at DESC)`
10. `idx_consumable_checkouts_csm`: `ON consumable_checkouts(consumable_id, checkout_date DESC)`

---

## 4. How to Verify Performance

Run the benchmark suite:
```bash
node scratch/measure_perf.cjs
```

Run integration tests:
```bash
npm test
```
