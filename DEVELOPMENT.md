# Campus Print Developer Documentation

This document describes the structure, technology stack, development workflow, and commands for the Campus Print Queue and Management System.

---

## 1. Project Overview
Campus Print is a campus printing queue and management system. It allows:
* **Students:** Upload documents (PDF), select print settings (color/mono, copies, single/double sided, page ranges), view pricing, and check shop queue availability.
* **Shop Admins:** View/approve/reject print requests, track printer heartbeats and operational statuses, override printer availability, and view performance metrics.
* **Windows Print Agent Client:** A local daemon running on the printing station that registers with the server, polls for pending print jobs, downloads PDF files, and executes print spooling locally via SumatraPDF.

---

## 2. Frontend Technology Stack
* **Framework:** React 19 (TypeScript)
* **Build Tool:** Vite 6
* **Styling:** Tailwind CSS v4 (using `@tailwindcss/vite` plugin)
* **Animations:** Motion (formerly Framer Motion)
* **Icons:** Lucide React
* **PDF Handling:** `pdfjs-dist` (for rendering and displaying uploaded PDF documents in the UI)

---

## 3. Backend Technology Stack
* **Runtime:** Node.js with TypeScript execution via `tsx`
* **Framework:** Express 4
* **File Uploads:** `multer`
* **Compression & CORS:** `compression`, `cors`
* **Security:** `bcrypt` (password hashing), `express-rate-limit` (request rate limiting)
* **PDF Parsing:** `pdf-lib` (to extract page count and metadata from uploaded documents)
* **AI & Authentication:** Google Auth Library (`google-auth-library`), Gemini AI Client (`@google/genai`)

---

## 4. Package Manager
* **npm** (a `package-lock.json` file is present in the repository root)

---

## 5. Development Commands
* **Frontend Dev Server:**
  ```bash
  npm run dev
  ```
  Starts Vite development server on port `3000` (host `0.0.0.0`).
* **Backend API Server:**
  ```bash
  npm run server
  ```
  or
  ```bash
  npm run start
  ```
  Runs the backend server via `tsx server/index.ts` on port `3001`.

---

## 6. Build Command
* **Build Frontend:**
  ```bash
  npm run build
  ```
  Compiles the React application into production-ready assets located in the `dist/` directory.

---

## 7. Test Command
* **All Tests (Unit + API):**
  ```bash
  npm run test
  ```
* **Unit Tests Only:**
  ```bash
  npm run test:unit
  ```
  Executes unit tests located in `tests/unit/` using Vitest.
* **API Tests Only:**
  ```bash
  npm run test:api
  ```
  Executes integration tests located in `tests/api/` using Vitest.
* **End-to-End Tests:**
  ```bash
  npm run test:e2e
  ```
  Executes Playwright tests located in `tests/e2e/`.

---

## 8. Lint Command
* **Lint Code:**
  ```bash
  npm run lint
  ```
  Runs `tsc --noEmit` to verify type safety across the project. No separate eslint config is set up in the root.

---

## 9. Type-Check Command
* **Type Check:**
  * Dedicated command: **Not configured**
  * Type checking is handled via the lint script: `npm run lint` (`tsc --noEmit`).

---

## 10. Environment Variables Required
Configure these variables in a `.env` file at the root of the project (see [.env.example](file:///d:/WEBSITES/campus-printing-queue-and-management-system/.env.example)):
* `GEMINI_API_KEY`: Required for Gemini AI API calls.
* `APP_URL`: Hosted URL of the application.
* `ADMIN_API_KEY`: Secret key for Owner-level admin tasks (defaults to `'campusprint_admin_123'` if omitted).
* `AGENT_TOKEN`: Shared authorization token for the print client agent (defaults to `'campusprint_agent_token_123'` if omitted).

---

## 11. Database Used
* **JSON File Store:** High-performance in-memory representation persisted directly to a JSON database file.
* **Database Paths:**
  * Runtime/Dev: `server/data/db.json`
  * Testing (Vitest/Playwright): `server/data/db.test.json` (active when `NODE_ENV === 'test'`)

---

## 12. Folder Structure
* **`/.agents/`**: Workspace agent customizations and instructions.
* **`/dist/`**: Production built assets (HTML, CSS, JS bundles).
* **`/docs/`**: Documentation files.
* **`/launcher/`**: Installer assets and desktop client connection bridge.
* **`/print-client/`**: Windows Print Client CLI code.
  * Contains the SumatraPDF binary, `client.cjs` connection script, local configurations, and logs.
* **`/public/`**: Public static assets.
* **`/scratch/`**: Temporary agent logs and scratchpads.
* **`/server/`**: Express API server codebase.
  * `/server/data/`: Location of `db.json` and `db.test.json`.
  * `/server/uploads/`: Temporary stored PDF files for active print queues.
* **`/src/`**: React application source code.
* **`/tests/`**: Test suites (unit, api, and e2e).

---

## 13. Entry Points
* **React Frontend:** [src/main.tsx](file:///d:/WEBSITES/campus-printing-queue-and-management-system/src/main.tsx) (configured as module script in [index.html](file:///d:/WEBSITES/campus-printing-queue-and-management-system/index.html)).
* **API Server:** [server/index.ts](file:///d:/WEBSITES/campus-printing-queue-and-management-system/server/index.ts).
* **Print Client:** [print-client/client.cjs](file:///d:/WEBSITES/campus-printing-queue-and-management-system/print-client/client.cjs).

---

## 14. API Server Startup Process
1. Run `npm run server` or `npm run start`.
2. The server loads environment variables via `dotenv.config()`.
3. Express server instance is created.
4. Checks for existence of the JSON database folder and initial database structure, writing default entries if they do not exist.
5. Performs startup migrations (e.g., deduping agent registry records).
6. Starts listening on `PORT` (defaults to `3001`).

---

## 15. Frontend Startup Process
1. Run `npm run dev`.
2. Vite launches, injecting the tailwind compilation engine (`@tailwindcss/vite`).
3. Starts a local dev server at `http://localhost:3000` (listening on all interfaces via `0.0.0.0`).
4. Compiles and hot-reloads TSX/CSS changes on the fly.

---

## 16. Playwright Test Execution
* Run `npm run test:e2e`.
* Playwright reads [playwright.config.ts](file:///d:/WEBSITES/campus-printing-queue-and-management-system/playwright.config.ts) and automatically launches:
  1. The API Server on port `3001` with `NODE_ENV: 'test'`.
  2. The Vite dev server on port `3000`.
* It runs the end-to-end tests sequentially using Chromium inside a single worker to prevent concurrency lock issues on `db.test.json`.

---

## 17. Common Developer Workflow
1. **Initialize Project:** Run `npm install` to load all project dependencies.
2. **Configure Environment:** Create a `.env` file copying the keys from [.env.example](file:///d:/WEBSITES/campus-printing-queue-and-management-system/.env.example).
3. **Run API Backend:** Open a terminal and run `npm run server`.
4. **Run Web Client:** Open a second terminal and run `npm run dev`.
5. **Run Print Client Daemon (Optional):** If testing print queue dispatching to physical/local printers, navigate to `print-client/` and run `run-client.bat`.
6. **Code changes:** Implement features inside `/src` or `/server`.
7. **Verify Tests:** Run `npm run test` (unit/api) or `npm run test:e2e` to verify features.
8. **Type check:** Run `npm run lint` before committing files.
9. **Build Production:** Run `npm run build`.
