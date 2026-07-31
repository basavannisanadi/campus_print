# AI Agent Guide: Code Quality & Architecture Review

Use this prompt template when conducting a code quality review or evaluating architecture changes.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Read the target source code files or pull request diffs. Do not modify any files.
4. **Formulate Plan:** Plan the analysis methodology (focusing on readability, scalability, duplicate code, and conformance to project priorities).

---

## 🛠️ Task-Specific Steps: Code Review
* **Check Modularity:** Confirm that functions are kept small and focused. Warn if UI files (like `StudentPortal.tsx` or `AdminPortal.tsx`) grow excessively monolithic.
* **Inspect Duplication:** Check if pricing formulas, date formatting, or print page range calculations duplicate existing helpers in [server/index.ts](file:///d:/WEBSITES/campus-printing-queue-and-management-system/server/index.ts).
* **Verify Type Strength:** Ensure explicit type parameters are written. Avoid allowing implicit `any` bindings.
* **Observe DB Efficiency:** Confirm that database read/write queries avoid unnecessary disk IO checks (e.g., matching the rules for memory-based heartbeats).

---

## 🧪 Verification & Delivery
1. **No Code Mutations:** Do not modify any project files during this review.
2. **Prioritized Report:** Rank review comments by impact (High, Medium, Low).
3. **Trace back to source:** Reference specific file paths and line ranges using click-capable absolute file URLs.
4. **Walkthrough:** Summarize structural strengths, highlight concerns, and suggest concrete code snippets for improvement.
