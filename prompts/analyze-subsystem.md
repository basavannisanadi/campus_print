# AI Agent Guide: Subsystem & Control Flow Analysis

Use this prompt template when analyzing a specific subsystem or tracing a complex control flow.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Focus exclusively on the files belonging to the subsystem of interest. Do not make code changes.
4. **Formulate Plan:** Outline the trace objectives (e.g. tracking how print jobs transit from client uploads to local printer spools).

---

## 🛠️ Task-Specific Steps: Subsystem Analysis
* **Inspect Component Structures:** Read entry points, configuration schemas, and interfaces.
* **Trace Network Communications:** Map API requests, SSE notifications, and headers.
* **Audit Database Interaction:** Trace read/write routines and sync timing loops.
* **Identify Performance & Scaling Limitations:** Highlight potential bottlenecks (like synchronous file access or large array traversals).

---

## 🧪 Verification & Delivery
1. **No Code Mutations:** Do not alter any project files.
2. **Structural Documentation:** Create a clear, readable diagram or step list depicting the system's control flow.
3. **Trace back to source:** Provide click-capable absolute file paths for critical code modules.
4. **Walkthrough:** Summarize subsystem operations, point out potential design limitations, and suggest optimization strategies.
