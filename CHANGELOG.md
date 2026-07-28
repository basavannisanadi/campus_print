# Changelog

All notable changes to the Campus Print project will be documented in this file.

## [1.0.0-rc2] - 2026-07-28

### Added
- **Global Dark Theme Support:** Integrated a theme switcher into the portal header with custom slate/gray styling and `localStorage` state persistence.
- **File Specifications Grid:** Replaced visual document preview thumbnails with a high-density metadata grid showing file size, format, page count, and validation status.

### Changed
- **UX/UI Redesign (Phase 9):** Replaced visual bento grid layouts and glassmorphism styling with a flat, high-contrast, linear two-column layout (Progressive Setup on Left, Queue Activity & History on Right).
- **Settings configuration panel:** Refactored copies selector to use a numeric stepper with button clamping at boundary values (1 to 10 copies).
- **Request Pipeline Optimization (Phase 4):** Implemented request-scoped database caching middleware to eliminate redundant `readDb()` file I/O operations on polled route handlers (`/api/printer/settings`, `/api/admin/stats`, etc.).

## [1.0.0-rc1] - 2026-06-25

### Added
- **Remote Printer Discovery & Refresh:** Enabled remote trigger from the Admin Portal (`POST /api/agent/scan-printers`) communicating with the Windows Print Agent via SSE stream and heartbeats to perform local hardware scans and dynamic configuration mappings, replacing predefined fallbacks.
- **In-Memory Heartbeat Sync (Rule 4):** Refined server connection checks to store transient heartbeat timestamps in memory and avoid frequent write cycles on `db.json` unless actual agent status, printer mapping configurations, or settings change.
- **Shop Isolation Rules:** Implemented secure shop authorization checking. Admin access is limited to a single shop context (`tokenShopId` verify checks) preventing cross-shop data leaks or operations bypasses.
- **Dual Printer Routing:** Persistent mapping for separate monochrome (B&W) and color printer queues. Incoming print jobs are dynamically routed to their target hardware spoolers.
- **Token-Based Approval Workflow:** Students receive a unique `CP-XXXX` approval token. Admins lookup jobs by token and approve them before they enter the active queue.
- **Windows Spooler Telemetry:** Enabled real-time printing progress feedback (0-100% pages printed) and hardware offline recovery tracking.
- **Failure Observation Snapshots:** Added administrative interface (`POST /api/jobs/:id/failure-snapshot`) to document physical hardware anomalies.
- **Comprehensive Integration Tests:** Configured 8 independent forensic test suites under the `scratch/` directory validating routing, isolation, telemetry, and discovery.

### Changed
- Refined `.env.example` to detail secure environment variable keys (`ADMIN_API_KEY`, `AGENT_TOKEN`).
- Updated the package configuration `name` to `campus-print` and bumped version to `1.0.0-rc1`.
- Cleaned up obsolete test references to static fallback printers.
