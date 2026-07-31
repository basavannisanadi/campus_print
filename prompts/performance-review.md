# AI Agent Guide: Performance & Asset Optimization

Use this prompt template when conducting a performance review, profile latency, or optimizing build sizes.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Examine resource usage patterns, network payload sizes, and database operations.
4. **Formulate Plan:** Outline the performance inspection vectors (focusing on backend event loop blockages, database write loads, and bundle weights).

---

## 🛠️ Task-Specific Steps: Performance Review
* **Inspect Database Writes:** Ensure that transient variables (like print client heartbeat timestamps) are not written to disk on every update tick. Verify that [db.ts](file:///d:/WEBSITES/campus-printing-queue-and-management-system/server/db.ts) utilizes atomic, asynchronous, or queued disk persistence schemes.
* **Analyze Bundle Size:** Identify which dependencies contribute to large bundle chunks (e.g. `pdfjs-dist`). Recommend code-splitting configurations in `vite.config.ts`.
* **Evaluate Rendering Overhead:** Inspect React portals for excessive re-renders, lack of list virtualization, or inefficient hooks (e.g., missing dependencies in `useMemo` or `useCallback`).
* **Check Compression & CORS:** Verify compression middleware is correctly enabled for large API responses (like historical job lists).

---

## 🧪 Verification & Delivery
1. **No Code Mutations:** Do not alter source code unless implementing an approved performance patch.
2. **Prioritized Report:** Rank performance optimizations by expected latency reduction or bundle size savings.
3. **Walkthrough:** Detail performance findings, suggest concrete configuration tweaks or code revisions, and list estimated metrics.
