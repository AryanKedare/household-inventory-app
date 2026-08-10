# Security Policy

## Supported code

Security fixes are applied to the current `main` branch. Production deployments should use a reviewed commit that has passed CI, Security and the production release-readiness process.

## Reporting a vulnerability

Please do not publish exploitable vulnerability details, secrets, tokens, household data or user data in a public issue.

Use GitHub's private vulnerability-reporting/security-advisory flow for this repository when it is available. If that option is not available, contact the repository owner privately through their GitHub profile and provide only the minimum information needed to establish a private reporting channel before sending sensitive details.

A useful report includes:

- affected commit/version;
- affected component or endpoint;
- clear reproduction steps using non-production/test data;
- expected versus observed behavior;
- impact and required attacker permissions;
- any suggested mitigation;
- whether secrets or real user data may have been exposed.

## Secrets

Never submit real Firebase service-account keys, Groq API keys, Expo tokens, APNs/FCM credentials, signing keys, OAuth tokens or production user data in an issue, pull request, test fixture or chat transcript.

Production secrets belong in the relevant managed secret/credential system. The mobile application must not contain the Groq API key or other server-only credentials.

## Security expectations for changes

Changes that affect authentication, authorization, household membership, destructive deletion, money/debt calculations, Firestore Security Rules, AI provider data, notifications or CI/deployment credentials should include relevant automated coverage and must pass the repository Security workflow before merge.

Do not use `npm audit fix --force` or dependency overrides to silence findings without reviewing framework compatibility and the resulting dependency tree.

See `docs/SECURITY_REVIEW_2026-08-11.md` and `docs/PRODUCTION_RELEASE.md` for the current reviewed posture and remaining release controls.
