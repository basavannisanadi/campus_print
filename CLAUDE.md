# Project Mission
Campus Print is a QR-based printing management platform that seamlessly connects students (who queue jobs via web applets), campus print shops (who approve and manage print requests), and desktop print agents (Windows-based background daemons that spool PDF documents to physical printers via SumatraPDF).

# Engineering Principles
- **Preserve existing architecture:** Do not restructure components without clear functional requirements.
- **Prefer minimal changes:** Limit edits to files and lines directly related to the target feature or bug fix.
- **Never rewrite working code:** Avoid cleanups or stylistic refactoring of operational codebase areas.
- **Keep components modular:** Keep sub-components and logic separated into focused, single-responsibility files.
- **Keep APIs backwards compatible:** Maintain version flags and legacy schema formats to prevent print agent synchronization failures.
- **Avoid unnecessary dependencies:** Do not add third-party packages unless absolutely required.

# Coding Standards
- **TypeScript strict mode:** Enforce strict type definitions, avoid implicit any types, and reject type bypasses.
- **Strong typing:** Utilize explicit type annotations for parameters, return values, and state structures.
- **Small reusable functions:** Extract logic into isolated, testable, and pure utilities.
- **Clear naming:** Write readable, descriptive names for functions, variables, components, and files.
- **Avoid duplicated logic:** Share common calculations (e.g., pricing or page parsing) across subsystems.
- **Explain architectural decisions:** Propose and align on architectural modifications before editing code.

# Development Workflow
Before executing any development task, follow this exact progression:
1. Read [AGENTS.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/AGENTS.md).
2. Read [DEVELOPMENT.md](file:///d:/WEBSITES/campus-printing-queue-and-management-system/DEVELOPMENT.md).
3. Read only the relevant subsystem files (e.g., frontend, backend, or client print daemon).
4. Create a short implementation plan detailing code edits.
5. Modify only the necessary files.
6. Run `npm run lint` to confirm type-check compliance.
7. Run `npm run build` to verify frontend compilation integrity.
8. Run relevant tests (unit, api, or e2e) to prevent regressions.
9. Explain all changes clearly in the final walkthrough.

# Safety Rules
**Never modify:**
- `node_modules`
- `dist`
- `test-results`
- `playwright-report`

**Never commit automatically:** Let the user review and commit changes manually.

**Never delete files:** Unless explicitly requested by the user.

**Stop and ask for clarification:** Prior to performing any major architectural refactors.

# Priority Order
1. **Reliability** — The system must operate without crashes, print queue locks, or lost database updates.
2. **Maintainability** — Code structure must remain clean, modular, and simple to debug.
3. **Security** — Input validations, session token safety, and access control policies must be strictly enforced.
4. **Readability** — Developers must easily understand flow, syntax, and logic formatting.
5. **Performance** — Maintain low memory usage, non-blocking event loops, and optimized bundle delivery.
