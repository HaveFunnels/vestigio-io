# Prisma Migrate — Baseline Initialization (Wave 2.5)

## What was done

The project previously used `prisma db push` to sync the schema directly to
production without tracking migrations. As of 2026-04-27 the project has been
initialized with Prisma Migrate using a **baseline migration**.

The baseline migration (`prisma/migrations/0_init/migration.sql`) contains the
full CREATE-only SQL that represents the current production schema. It was
generated with:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
```

This file is checked into version control but has **not** been executed against
production (the tables already exist). Instead it must be marked as already
applied — see the one-time production step below.

---

## One-time production step (REQUIRED before first deploy)

Run this once against the production database to tell Prisma that `0_init` has
already been applied (so it doesn't try to re-create existing tables):

```bash
DATABASE_URL="<production-url>" npx prisma migrate resolve --applied 0_init
```

On Railway this can be run from any machine with network access to the DB, or
via a one-off deploy command / Railway CLI:

```bash
railway run npx prisma migrate resolve --applied 0_init
```

After this command succeeds, the `_prisma_migrations` table will contain a
single row recording `0_init` as applied.

---

## How future migrations work

### Local development

```bash
# Make schema changes in prisma/schema.prisma, then:
npx prisma migrate dev --name descriptive_name
```

This creates a new timestamped migration in `prisma/migrations/`, applies it to
your local DB, and regenerates the Prisma Client.

### CI / Production deploys

```bash
npx prisma migrate deploy
```

This applies any pending migrations that have not yet been recorded in
`_prisma_migrations`. It is safe to run repeatedly (idempotent — already-applied
migrations are skipped).

Add this to your deploy pipeline (e.g. Railway deploy command, Dockerfile, or
GitHub Actions) **before** starting the app:

```bash
npx prisma migrate deploy && npx prisma generate && next build
```

---

## Rules going forward

| Rule | Rationale |
|------|-----------|
| **Never use `prisma db push` against production** | It bypasses the migration history and can silently drop columns/tables. |
| Use `prisma migrate dev` locally | Generates migration files that are code-reviewed and versioned. |
| Use `prisma migrate deploy` in CI/prod | Applies only pending, committed migrations. |
| Commit migration files | They are the source of truth for schema evolution. |
| Never manually edit `migration.sql` after it has been applied | Create a new migration instead. |

---

## Emergency: reset local dev DB

If your local DB gets out of sync:

```bash
npx prisma migrate reset
```

This drops and recreates the local database, re-applies all migrations, and
runs `prisma/seed.ts`. **Never run this against production.**

---

## Package.json scripts

| Script | Purpose |
|--------|---------|
| `db:migrate:deploy` | Run pending migrations (CI/prod) |
| `db:migrate:dev` | Create + apply a new migration (local) |
| `db:push:dev` | Quick schema sync for local prototyping (no migration file created) |
| `db:setup` | Full local setup: migrate + TimescaleDB extensions |
