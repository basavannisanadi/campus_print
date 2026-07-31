# AI Agent Guide: Security & Vulnerability Review

Use this prompt template when conducting a security assessment, verifying access tokens, or reviewing data input validations.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Examine API route definitions, authentication middleware (`requireAuth`, `requireAdmin`), input parsers, and file upload filters in `server/index.ts`.
4. **Formulate Plan:** Detail the review scope (focusing on route authorization, path traversals, input injection, and token security).

---

## 🛠️ Task-Specific Steps: Security Review
* **Inspect Middleware Guards:** Ensure all routes accessing sensitive records (like admin settings, database operations, or user files) are protected by `requireAuth` or `requireAdmin`.
* **Analyze File Upload Rules:** Check Multer constraints (like file extensions, MIME-type validations, and upload size limits) in `server/index.ts`. Verify that file names are safely randomized.
* **Audit Token Safety:** Check how student, admin, and owner sessions are tracked and cleared. Verify that tokens use sufficient entropy.
* **Verify CORS Configuration:** Inspect origin validation regex boundaries to confirm they block cross-origin request spoofing.

---

## 🧪 Verification & Delivery
1. **No Code Mutations:** Do not modify any files during this audit unless specifically asked to apply a security patch.
2. **Prioritized Report:** Rank findings by severity: Critical, High, Medium, Low.
3. **Trace back to source:** List affected files and exact line numbers with click-capable links.
4. **Walkthrough:** Summarize vulnerability findings, outline the risk vectors, and suggest secure implementation examples.
