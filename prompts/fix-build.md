# AI Agent Guide: Resolve Build & Compilation Errors

Use this prompt template when the compiler, bundler, or type-check engine reports a build failure.

---

## 📋 Core Instructions
1. **Understand Project Rules:** First read [CLAUDE.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/CLAUDE.md) and [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. **Review Tech Stack & Commands:** Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. **Analyze Target Subsystem:** Focus inspection specifically on the file paths flagged by the build error stack trace.
4. **Formulate Plan:** Map out a minimal code fix targeting only the root compiler/bundler error. Explain the error and files involved.

---

## 🛠️ Task-Specific Steps: Fixing Build Issues
* **Focus on First Error Only:** Address the very first compilation error shown in the console logs. Subsequent errors are frequently cascades from the root issue.
* **Respect TypeScript Types:** If the build fails due to typescript warnings or missing types, write strict type overrides or exports. Avoid using quick hacks like `// @ts-ignore` or casting to `any` unless absolutely necessary to avoid rewriting functional libraries.
* **Keep Configuration Safe:** Do not modify `vite.config.ts` or `tsconfig.json` parameters unless the error is directly caused by compiler settings.

---

## 🧪 Verification & Delivery
1. **Apply minimal changes:** Fix only the code lines producing the error.
2. **Type Check:** Run `npm run lint` (`tsc --noEmit`) to confirm the compiler parses types successfully.
3. **Compilation:** Run `npm run build` to verify the frontend production assets build without warnings.
4. **Testing:** Run `npm run test` to verify that compiler changes do not break test runner execution.
5. **Walkthrough:** Explain the cause of the compilation error, what code was modified, and confirm the build succeeded.
