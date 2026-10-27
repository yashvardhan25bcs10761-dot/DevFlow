# AGENTS.md — Working rules for DevFlow

Read this file at the start of every task. Read `SPEC.md` for what to build. Only work on the phase you are given.

## Rules

1. Inspect the repo before creating or changing files. Preserve working code; never overwrite blindly.
2. Before each phase, write a short plan: goal, files to create/change, key decisions, any setup I must do. Then implement the smallest working slice.
3. Keep the app runnable after every phase. If a command fails, diagnose before moving on.
4. Never claim something works unless you ran it. Say exactly which commands you ran and their real output (pass/fail). Never invent GitHub responses, stats, test results, or deployment results.
5. Never hardcode repository stats in app views. Missing data must never silently become 0.
6. Secrets only in env vars. Never commit `.env`. Never print secrets in logs. Never ask me to paste secrets into chat or source files.
7. Few dependencies. Prefer simple code over abstraction. No empty placeholder files or folders.
8. Do not start a later phase, or any P1/stretch item, until the current phase's checklist passes.
9. Don't remove existing functionality to make a build pass.
10. Don't try to deploy or create cloud accounts yourself. Give me exact steps for anything needing my accounts or credentials.
11. Keep code understandable: I must be able to explain every algorithm in a viva. Comment the *why* in scoring and stale-detection code.

## End-of-phase report (always)

- Files created/changed
- What works now
- Exact commands to run + manual verification steps
- Test results (real)
- Known limitations
- Checklist status for this phase (pass/fail per item)
- Next phase

## Verification

Use `npm test` and `npm run build` (and lint if configured) from the actual package.json scripts. For UI work, run the app and verify the flow in the browser, not just by reading code.
