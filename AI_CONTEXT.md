# AI Context Document — Campus Print

This document provides a comprehensive overview of the Campus Print repository, its architecture, project structure, conventions, and rules, to enable any AI assistant to understand and contribute to the codebase immediately.

---

## 1. Project Overview

Campus Print is an enterprise-grade, zero-trust campus print management and queue system. It consists of a multi-shop responsive web portal (Student Portal, Admin Portal, Owner Dashboard) and a background Windows Print Agent client that interacts directly with the local Windows print spooler and SumatraPDF executable to orchestrate physical printing.

---

## 2. System Architecture

```
                                  [ STUDENT PORTAL ]
                                          │
                                          │ (File Upload & Metadata)
                                          ▼
[ OWNER DASHBOARD ] ◄─────────────► [ EXPRESS SERVER ] ◄─────────────► [ ADMIN PORTAL ]
                                    (JSON DB, Multer)                  (HMAC Shop Admin Token)
                                          │
                                          │ (SSE stream: events/notifications)
                                          │ (Heartbeat polling & job claims)
                                          ▼
                                 [ WINDOWS PRINT CLIENT ]
                                    (Node.js Daemon)
                                          │
                                          ▼ (SumatraPDF CLI Spooling Command)
                                 [ WINDOWS PRINT SPOOLER ]
                                          │
                                          ▼
                                 [ PHYSICAL PRINTER ]
```

### Components:
1. **Frontend Applet (Vite/React):** A unified web portal containing:
   - **Student Portal:** Uploads documents, selects settings, displays pricing, generates `CP-XXXX` approval tokens and `PRNT-XXX` claim tokens.
   - **Admin Portal:** Accessible by shop administrators. Lookups and approves jobs, maps printers, triggers scanner discovery, and monitors real-time spooler queues.
   - **Owner Dashboard:** Accessible by central system owners. Aggregates multi-shop telemetry, warnings, failures, and daily/weekly print job volumes.
2. **Backend Server (Express):** Houses API routes, handles rates limiting, manages file uploads via Multer, broadcasts real-time updates via EventSource Server-Sent Events (SSE), and coordinates claims.
3. **Database (LowDB-style JSON file):** Stored at `server/data/db.json` holding collections of shops, jobs, agents, printers, and settings.
4. **Windows Print Agent Client (Node.js CJS):** Running as a local daemon at the print shop PC. It connects via SSE, claims queued jobs, downloads files, converts Microsoft Office formats, checks printer spoolers via PowerShell, reports device status, and executes printing.

---

## 3. Sprint Status & Features

### Completed Features (v1.0 RC1):
- **Dynamic Printer Discovery:** Event-driven hardware scan request triggered from Admin Portal, handled by the print client's PowerShell scanner, and returned to populating active choices.
- **In-Memory Heartbeats:** Compliance with database write restrictions (Rule 4) to eliminate write wear.
- **Dual Printer Queue Routing:** Mapped monochrome prints to the black-and-white queue and color prints to the color queue.
- **Spooler Telemetry & Progress:** Progress monitoring (0-100% pages printed) and hardware recovery loops.
- **Strict Shop Isolation:** Scope validation on API endpoints preventing cross-shop data leaks.

### Pending Roadmap:
- Production hosting configuration (GitHub pipeline setup).
- HTTPS SSL setups for remote print agent tunnels.

---

## 4. Repository Structure & Conventions

```
├── .agents/                    # Custom agent behavior rules
├── print-client/               # Windows Print Agent client package
│   ├── client.cjs              # Main Print Agent service daemon
│   ├── config.json             # Agent local configuration file (Ignored in git)
│   ├── SumatraPDF.exe          # SumatraPDF execution engine
│   └── printed_output/         # PDF spooler logs and output
├── server/                     # Express Backend Server
│   ├── db.ts                   # JSON database interface and types
│   ├── index.ts                # Express setup, API routes, and SSE controllers
│   ├── data/                   # JSON file-based database folder (Ignored in git)
│   └── uploads/                # Temporary directory for student file uploads (Ignored in git)
├── src/                        # Vite/React Frontend Application
│   ├── App.tsx                 # Main application shell and SSE handlers
│   ├── components/             # React View Components (Student, Admin, Owner)
│   └── types.ts                # Shared frontend types and interfaces
├── scratch/                    # Integration and regression test suites
└── package.json                # Main project scripts and dependencies
```

---

## 5. Coding Rules & Constraints

Assistants contributing to this codebase must adhere strictly to these rules:

1. **Windows Drive Navigation:** When executing shell commands, use the `/d` switch for drive navigation (e.g. `cd /d D:\path`) to ensure correct folder execution.
2. **SumatraPDF Dynamic Printer Selection:** Never hardcode defaults like `-print-to-default`. Always pass the dynamically mapped string `-print-to "${resolvedPrinterName}"`.
3. **Resource-Optimized Hardware Scanning:** Do not run periodic scan timers. Use the event-driven flag `scanRequested` cleared upon reporting.
4. **In-Memory Heartbeat Tracking:** Maintain agent heartbeat timestamps in memory. Do not trigger disk writes (`writeDb`) unless persistent configurations, statuses, or printer lists change.
5. **No Placeholders or Fake Values:** Every item on the UI must reflect actual backend state.
6. **Strict Shop Scoping:** Every data request must enforce `shopId` scoping parameters.
