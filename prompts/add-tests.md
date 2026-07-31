# AI Agent Guide: Writing Unit, API & E2E Tests

Use this prompt template when adding unit tests, Express route API integration tests, or Playwright E2E tests.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Read the code logic of the component, service, or API route being tested.
4. **Formulate Plan:** Outline the test scenarios (including positive inputs, negative validations, edge cases, and mocks).

---

## 🛠️ Task-Specific Steps: Test Implementation
* **Unit Testing (Vitest):**
  * Write test assertions under `/tests/unit/`.
  * Ensure pure utility functions (e.g. pricing, page range counts) are fully verified.
* **API Testing (Vitest + Supertest):**
  * Write route assertions under `/tests/api/`.
  * Run the backend server using the test database path (`server/data/db.test.json`).
  * Ensure correct HTTP status codes are asserted.
* **E2E Testing (Playwright):**
  * Write integration user flows under `/tests/e2e/`.
  * Verify full workflows (e.g. student uploading document -> admin dashboard approving -> print job status updating).
  * Configure Playwright to execute with a single worker to prevent file locks on the database.

---

## 🧪 Verification & Delivery
1. **Type Check:** Run `npm run lint` (`tsc --noEmit`).
2. **Compilation:** Run `npm run build`.
3. **Run Tests:** Execute the relevant test command:
  * Unit: `npm run test:unit`
  * API: `npm run test:api`
  * E2E: `npm run test:e2e`
4. **Walkthrough:** Document what scenarios were added, output the test execution success logs, and confirm no regressions exist.
