# AI Agent Guide: Debug Runtime & Connectivity Issues

Use this prompt template when debugging runtime issues, print job freezes, agent connectivity drops, or server crashes.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Examine runtime execution logs (e.g., Express server logs, print-client logs, or browser console stack traces).
4. **Formulate Plan:** Detail the reproduction steps, identify suspected trace paths, and outline proposed diagnostic logging or code changes.

---

## 🛠️ Task-Specific Steps: Debugging Runtime Errors
* **Trace Data Flow:** Trace the lifecycle of data elements (e.g., check print job progression from student submission `/api/jobs` -> admin approval -> agent queue poll `/api/jobs/next` -> SumatraPDF dispatch).
* **Verify Environments:** Ensure variables like `ADMIN_API_KEY` and `AGENT_TOKEN` match across the client and server configuration parameters.
* **Observe Concurrency locks:** Inspect database file operations in [db.ts](file:///d:/WEBSITES/campus-printing-queue-and-management-system/server/db.ts) to verify that simultaneous operations do not cause process termination.
* **Diagnostic Logging:** Add descriptive console logging temporarily to isolate parameter states in complex asynchronous flows.

---

## 🧪 Verification & Delivery
1. **Apply minimal changes:** Avoid altering unrelated logic branches.
2. **Type Check:** Run `npm run lint` (`tsc --noEmit`).
3. **Compilation:** Run `npm run build`.
4. **Testing:** Run the integration test suite (`npm run test:api` or `npm run test:e2e`) to verify that the bug is resolved and no regressions exist.
5. **Walkthrough:** Detail the root cause of the runtime error, outline what files/lines were corrected, and provide logs proving the code is stable.
