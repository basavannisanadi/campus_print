# AI Agent Guide: Module Refactoring & Modularization

Use this prompt template when tasked with refactoring monolithic files or splitting large functions.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Carefully read the target module (e.g. `StudentPortal.tsx`, `AdminPortal.tsx`, or `server/index.ts`) to map dependencies and state flows.
4. **Formulate Plan:** Document the step-by-step refactoring strategy. Identify what blocks will be extracted and what files will be created or modified. **Wait for user approval before editing code.**

---

## 🛠️ Task-Specific Steps: Refactoring Modules
* **Maintain Functionality:** The primary objective is to reorganize code structures without changing the system's observable features.
* **Component Extraction:** Pull sub-elements (like tables, grids, models, or charts) out of massive components. Move them into focused folders like `/src/components/common` or `/src/components/admin`.
* **Centralize Helper Utilities:** Gather duplicate helpers (such as `countPagesFromRange` or file sizing conversions) into dedicated shared utility files.
* **Maintain Backward Compatibility:** Ensure API request and response formats remain identical to avoid disruption to clients.

---

## 🧪 Verification & Delivery
1. **Refactor Incrementally:** Split code step-by-step, verifying compilations at each stage.
2. **Type Check:** Run `npm run lint` (`tsc --noEmit`) to verify that no interface bindings are broken.
3. **Compilation:** Run `npm run build` to confirm the code compiles cleanly.
4. **Testing:** Run the unit and integration test suites (`npm run test`) to verify there are no regressions.
5. **Walkthrough:** Document what modules were extracted, describe where files are now located, and verify all tests pass.
