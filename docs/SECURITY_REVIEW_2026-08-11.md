# Security and Reliability Review — 11 August 2026

Scope: application source, Cloud Functions, Firestore rules, GitHub Actions, dependency-audit output and production/release documentation on the HomeStock repository.

## Remediated in this review

### Household deletion retry authorization

The deletion callable already used a lock plus recursive Firestore deletion, but an interrupted recursive delete could remove the owner's membership child document before the household root. A subsequent retry then required that now-missing owner membership and failed authorization.

Remediation:

- the initial delete still requires the current sole owner;
- after the household is marked `deleting`, only the original `deletionStartedBy` user may resume the operation;
- a retry re-cleans the invite/default-household reference and resumes recursive deletion without depending on child membership documents that may already be gone;
- another user cannot take over an interrupted deletion;
- emulator tests cover both retry and lock-takeover denial.

### Settlement data corruption fail-closed behavior

Stored expense debt state previously treated an invalid `settledCents` value as zero. In corrupted data this could incorrectly reopen an already-settled debt.

Remediation:

- `amountCents` and `settledCents` must both be safe integers within valid bounds;
- `settledCents` must be between zero and the original debt amount;
- invalid stored debt state now returns `data-loss` and writes no new settlement;
- emulator coverage verifies corrupted state remains untouched and no repayment record is created.

### External-provider request bounds

Groq and Expo requests previously depended only on the enclosing Cloud Function runtime timeout.

Remediation:

- Groq requests now use an explicit request timeout;
- Expo push-send and push-receipt requests use explicit request timeouts;
- provider JSON is parsed defensively;
- push delivery failures remain isolated from the household action that generated the notification.

### CI and deployment action maintenance

Workflows were using older GitHub Action majors whose JavaScript runtimes generated Node 20 deprecation warnings.

Remediation:

- checkout/setup-node moved to current Node-24-backed majors;
- setup-java moved to v5;
- CodeQL moved to v4;
- Google Cloud authentication moved to `google-github-actions/auth@v3`;
- CI/release workflows declare least-privilege `contents: read` where applicable;
- Firebase deployment continues to use short-lived Workload Identity Federation with `id-token: write` rather than a committed service-account key;
- `gha-creds-*.json` is ignored to prevent generated Google auth credentials from entering Git/release artifacts.

### Dependency maintenance

- Dependabot now checks root npm packages, Functions npm packages and GitHub Actions weekly.
- Security CI continues to surface high+ production dependency findings and blocks critical findings.

## Reviewed controls that remain appropriate

- Firestore privileged finance, settlement, budget, activity, purchase-history and AI records are backend-write-only.
- Household reads are membership scoped.
- Cloud Functions validate authentication and household membership/roles for privileged operations.
- Purchases, quantity adjustments, expense creation and settlements use Firestore transactions where concurrent changes matter.
- AI final financial calculations are deterministic server code; AI output is treated as a draft/suggestion.
- Groq credentials are declared as Firebase secrets and are not part of Expo public configuration.
- Account deletion requires recent authentication and blocks deletion while the user still owns a household.
- Production release readiness intentionally blocks while callable Functions still use `enforceAppCheck: false`.

## Known dependency findings

Current npm audit output includes transitive findings in framework/provider dependency trees.

### Expo / Metro `image-size`

The mobile production dependency tree currently includes high-severity `image-size` parser denial-of-service advisories through Metro/Expo. npm's forced remediation proposes a breaking framework downgrade rather than a compatible in-place update.

Decision: keep the finding visible in every Security run, block critical findings, and wait for an upstream-supported Expo/Metro remediation rather than using `npm audit fix --force` to place the project on an unsupported stack.

### Transitive `uuid`

Moderate `uuid` findings are present through Expo tooling and Google/Firebase dependency chains. Direct Firebase Admin and Functions packages should remain on current supported releases; do not force a transitive major override without upstream compatibility testing.

## Open repository-level hardening items

### Package-lock reproducibility

The repository currently has no committed root `package-lock.json` and no `functions/package-lock.json`.

Required follow-up:

1. generate both lockfiles from the exact committed manifests in a normal npm-connected development environment;
2. review the resulting dependency diff and audit output;
3. commit the lockfiles;
4. change CI, Security, Firebase deploy and release-readiness dependency installation from `npm install` to `npm ci`;
5. enable setup-node dependency caching only after reviewing cache-poisoning implications for privileged workflows.

Lockfiles must not be hand-authored.

### App Check

Do not switch production callables to `enforceAppCheck: true` until native App Check attestation is configured and verified on real iOS and Android staging builds. The release gate correctly remains red until this is completed.

### Non-AI abuse controls

AI endpoints have per-user daily quotas. Invite/admin and other sensitive non-AI callables still need a deliberate rate/abuse-control design before a broad public launch, especially invite-code probing/regeneration and destructive administrative operations.

### Live provider/device validation

CI cannot validate APNs, FCM, Expo device delivery, Groq production credentials, App Check attestation or store signing. These remain staging/release checks rather than source-code test gaps.

## Review outcome

No evidence was found in this pass of a client-side path that directly writes backend-only finance, settlement, purchase-history, AI quota, push-receipt or activity records. The concrete correctness/security issues discovered during this review were addressed with regression coverage. Public production release remains intentionally blocked by environment/App Check/legal/device requirements documented in `docs/PRODUCTION_RELEASE.md` and `docs/IMPLEMENTATION_STATUS.md`.
