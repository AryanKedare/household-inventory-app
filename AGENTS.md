# HomeStock Coding Agent Rules

Read `README.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md` before changing code.

## Core rule

Implement one phase at a time. Do not silently broaden scope or rewrite unrelated working code.

## Architecture

- React Native + Expo SDK 57.
- TypeScript strict mode.
- React Navigation 7 stable; do not migrate to alpha/beta navigation packages without approval.
- Firebase Authentication, Firestore and 2nd-gen Cloud Functions.
- Firestore data is scoped under `households/{householdId}`.
- Privileged operations validate the authenticated UID server-side.
- Store money as integer cents.
- Use server timestamps for authoritative persisted timestamps.
- Do not put service-account credentials or other secrets in the mobile bundle.

## Security

Every data feature includes Security Rules changes/tests in the same phase.
Never weaken rules just to make a failing client request pass.
Do not permit direct client writes to membership, invite-code, purchase, price-history or activity
documents when the architecture designates a trusted backend operation.

## Quality gate

Before calling a phase complete, run:

```bash
npm run typecheck
npm run lint
npm test
npm run functions:build
npm run test:rules
```

If a command cannot run because of an environment dependency, report that explicitly rather than
claiming it passed.

## End-of-phase report

Report:

- phase completed
- files created/modified
- database changes
- security changes
- tests and actual results
- commands executed
- assumptions
- known issues
- manual device testing required
- next phase name only
