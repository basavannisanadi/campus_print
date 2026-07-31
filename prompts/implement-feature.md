# AI Agent Guide: Feature Implementation

Use this prompt template when tasked with implementing a new feature in the Campus Print codebase.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md) to understand coding standards and safety guardrails.
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md) to recall execution, build, lint, and test scripts.
3. **Analyze Target Subsystem:** Locate and read ONLY the files related to the feature area (e.g., `/src` for client UI, `/server` for APIs, `/print-client` for desktop printing).
4. **Formulate Plan:** Write a short implementation plan listing files to modify and mock APIs or UI layouts needed. Do not make code changes yet.

---

## 🛠️ Task-Specific Steps: Feature Implementation
* **Design Consistency:** Ensure new UI elements align with existing styling and layout rules (e.g., using Tailwind and Framer Motion transitions as seen in [StudentPortal.tsx](file:///d:/WEBSITES/campus-printing-queue-and-management-system/src/components/StudentPortal.tsx) and [AdminPortal.tsx](file:///d:/WEBSITES/campus-printing-queue-and-management-system/src/components/AdminPortal.tsx)).
* **API Backward Compatibility:** If editing server-side APIs, ensure changes do not break communication with desktop Print Agents.
* **Strict Type Safety:** Add strict TypeScript interfaces. Avoid casting to `any`.
* **Database Updates:** If a new schema property is needed, update the interfaces in [db.ts](file:///d:/WEBSITES/campus-printing-queue-and-management-system/server/db.ts) and ensure default value initializations are defined in `readDb()`.

---

## 🧪 Verification & Delivery
1. **Incremental Changes:** Apply changes to files in small, functional commits/edits.
2. **Type Check:** Run `npm run lint` (`tsc --noEmit`) to verify no TypeScript compilation errors exist.
3. **Compilation:** Run `npm run build` to verify Webpack/Vite bundle creation compiles cleanly.
4. **Testing:** Run unit (`npm run test:unit`) or API tests (`npm run test:api`) related to the feature.
5. **Walkthrough:** Document the changes made and list the verification results in your final response.
