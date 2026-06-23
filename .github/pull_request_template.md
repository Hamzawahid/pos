## What & why
<!-- Short description of the change and the problem it solves. -->

## Tests (required — no tests, no merge)
RetailPOS has live paying customers. Per policy, **every change ships with tests**.

- [ ] Added/updated unit or API tests covering the new behaviour (happy path **and** the failure this fixes)
- [ ] `cd frontend && npm test` is green (Vitest)
- [ ] `cd tests && npm test` is green (Jest API/integration)
- [ ] New logic was made testable (pure functions extracted to `frontend/src/lib/*` where practical)

## Deploy
- [ ] Will deploy via `safe-deploy-retailpos.sh` (builds from git, runs the test gate) — never `npm build` inside a deploy dir
- [ ] Smoke-tested the critical path (login persists, create a sale, customer dropdown, scanner)

> A PR with new/changed code and **no corresponding test will not be merged.**
