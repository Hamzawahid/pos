# RetailPOS

A multi-tenant point-of-sale system with React frontend, Node/Express/TypeScript backend, and a comprehensive automated test suite.

## Repository structure

```
pos/
├── backend/          # Node.js + Express + TypeScript API
├── frontend/         # React 19 + Vite
├── tests/            # Jest + Supertest API test suite (204 tests)
└── .github/
    └── workflows/
        ├── test.yml            # Runs on every push/PR — CI gate
        ├── deploy-staging.yml  # Auto-deploys to staging when tests pass on staging branch
        └── deploy-prod.yml     # Deploys to prod on merge to main (tests + manual approval required)
```

## CI/CD rules

- **Every push** runs the full test suite (204 tests)
- **PRs** to `main` and `staging` are blocked until all tests pass
- **Staging** deploys automatically when tests pass on the `staging` branch
- **Production** requires:
  1. All 204 tests green ✅
  2. Manual approval from a reviewer (GitHub Environments gate) ✅
  3. Merge/push to `main` branch ✅

**There is no way to deploy to production without passing tests.**

## Local setup

### Backend

```bash
cd backend
cp .env.example .env      # fill in DB credentials and JWT secret
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Tests

```bash
cd tests
# Requires MySQL with pos_db_test database
# Create the DB user: GRANT ALL ON pos_db_test.* TO 'prod_user'@'localhost';
npm test
```

## GitHub Actions secrets required

Add these in GitHub → Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `STAGING_HOST` | Staging server IP/hostname |
| `STAGING_USER` | SSH user (e.g. root) |
| `STAGING_SSH_KEY` | Private SSH key for staging server |
| `PROD_HOST` | Production server IP/hostname |
| `PROD_USER` | SSH user |
| `PROD_SSH_KEY` | Private SSH key for prod server |

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — protected, requires PR + passing tests + reviewer approval |
| `staging` | Staging — auto-deploys after tests pass |
| feature branches | Development work → PR into staging or main |

## Test suite coverage

| Suite | Tests |
|-------|-------|
| auth | 34 |
| products | 34 |
| sales | 40 |
| expenses | 21 |
| users | 17 |
| reports | 16 |
| superadmin | 12 |
| integration/sales-flow | 15 |
| integration/tenant-isolation | 15 |
| **Total** | **204** |
