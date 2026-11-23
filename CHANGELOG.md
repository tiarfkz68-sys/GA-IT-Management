# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-23

### Added
- **Performance Optimizations & Guard Suite**: Added Express Gzip compression (68% bundle reduction), ETag conditional caching (304 Not Modified), PostgreSQL B-tree foreign key indexes (98.3% planner cost reduction), CDN resource hints (`preconnect`, `dns-prefetch`), deferred non-critical scripts, and in-memory TTL caching for reference data recorded in `PERF.md`.
- **Multi-line ATK / Consumable Transactions**: Multi-row forms for registering new consumable master items, batch restock receiving, and batch checkout with dynamic animated counters.
- **Batch Asset Management**: Multi-select row selection, mass status changes, thermal barcode sticker batch printing, and combined Berita Acara Serah Terima (BAST) document generation.
- **Excel Asset Importer**: In-browser XLSX/CSV spreadsheet parser with validation and downloadable template generator.
- **Live Search & Filter Toolbar**: Real-time multi-criteria filtering for Assets (category, division, status), Consumables, and Tickets with instant reset.
- **Automated Accessibility Test Suite**: Integration of `@axe-core/cli` and `pa11y` (HTML_CodeSniffer) generating compliance reports in `a11y-reports/axe.json`.
- **Integration Test Suite**: Automated backend API endpoint test runner in `scratch/test_endpoints.cjs` (`npm test`).

### Changed
- **Visual Design (60-30-10 Rule)**: Re-skinned entire interface with a Linen (`#FAF8F5`) canvas, Navy (`#0C1E33`) primary accents, and warm Amber (`#F59E0B`) action highlights.
- **Backend Architecture**: Decoupled monolithic server into clean Express route modules (`auth.js`, `assets.js`, `consumables.js`, `tickets.js`, `accessories.js`, `admin.js`).
- **Responsive Layout**: Re-engineered table overflow containers and navigation drawer to ensure complete usability on mobile screens without horizontal clipping.

### Fixed
- **WCAG 2.2 AA Accessibility Compliance**: Remediated all 16 modals with accessible dialog roles, focus trapping, Escape key dismissal, explicit `<label for="...">` associations, minimum touch target dimensions ($\ge 24\text{px}$), and contrast ratios $\ge 10.5:1$.
- **Inventory Concurrency**: Prevented race conditions and negative inventory during simultaneous checkouts using PostgreSQL `SELECT FOR UPDATE` row locks.
- **Mobile Viewport Overflow**: Resolved horizontal layout truncation across cards, tables, and modal dialogs.

### Security
- **OWASP Hardening**: Implemented strict Content Security Policy (CSP), anti-clickjacking headers (`X-Frame-Options: SAMEORIGIN`), and MIME sniffing protection.
- **Brute-Force Rate Limiting**: Added in-memory rate limiting to `/api/auth/login` (5 attempts per 15-minute window).
- **SQL Injection Prevention**: Hardened all database queries with parameterized SQL inputs.
- **Authentication & RBAC**: Added Bearer token validation and role-based route guard middleware.

---

## [1.0.0] - 2026-11-22

### Added
- Initial release of Unified General Affairs & IT Management Super App Core.
- Hardware asset registration, category management, and peripheral accessory tracking.
- Stock alerts for office stationery and consumables.
- Internal IT helpdesk ticketing system.
- Docker Compose setup (`docker-compose.yml`) for containerized deployment with PostgreSQL.
