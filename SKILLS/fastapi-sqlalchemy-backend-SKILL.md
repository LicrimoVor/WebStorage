---
name: fastapi-sqlalchemy-backend
description: Build, extend, refactor, review, and test production Python backend services based on FastAPI, Pydantic v2, SQLAlchemy 2.x async ORM, Alembic, and PostgreSQL. Use for API endpoint work, database models and queries, migrations, repositories/services, transactions, authentication/authorization integration, background jobs, backend testing, performance fixes, and backend project structure. Prefer this skill whenever a task touches FastAPI routes, SQLAlchemy models or sessions, Alembic revisions, PostgreSQL persistence, or Python backend architecture.
---

# FastAPI + SQLAlchemy Backend

Build a boring, explicit, typed backend that is easy to migrate, test, and operate.

## Core stack

Use the project's installed versions. For a new project, prefer:

- Python 3.12+.
- FastAPI.
- Pydantic v2 and `pydantic-settings`.
- SQLAlchemy 2.x typed ORM.
- Async PostgreSQL driver.
- Alembic.
- PostgreSQL.
- pytest + pytest-asyncio.
- httpx for API tests.
- Ruff for linting/formatting.
- mypy or pyright when static type checking is enabled.

Do not introduce an alternative ORM, migration framework, or web framework unless explicitly requested.

## First actions

Before changing code:

1. Inspect `pyproject.toml`, lockfiles, application entrypoint, database setup, Alembic config, and test configuration.
2. Identify the existing module boundaries and preserve them unless the task is explicitly architectural.
3. Inspect at least one similar endpoint/model/migration/test before inventing a new pattern.
4. Check the installed library versions before using recently added APIs.
5. Make the smallest coherent change that preserves the existing public contract unless a contract change is required.

For an existing repository, repository conventions override examples in this skill unless they are unsafe or internally inconsistent.

## Recommended project architecture

For a new service, organize code by business module rather than by giant global technical folders:

```text
backend/
├── alembic.ini
├── migrations/
│   ├── env.py
│   └── versions/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── errors.py
│   │   ├── logging.py
│   │   └── security.py
│   ├── api/
│   │   ├── dependencies.py
│   │   └── router.py
│   └── modules/
│       └── users/
│           ├── model.py
│           ├── schemas.py
│           ├── repository.py
│           ├── service.py
│           ├── router.py
│           └── dependencies.py
└── tests/
    ├── conftest.py
    ├── integration/
    └── unit/
```

Use only the files a module actually needs. Do not create empty repository/service layers merely to satisfy a template.

### Responsibilities

- `model.py`: persistence model and database-only concerns.
- `schemas.py`: API/application DTOs and validation.
- `repository.py`: reusable persistence queries.
- `service.py`: use-case orchestration and business rules.
- `router.py`: HTTP transport, dependency wiring, status codes, serialization.
- `dependencies.py`: module-specific dependency providers.
- `core/`: infrastructure shared by the whole backend.
- `api/`: root API wiring and cross-cutting HTTP dependencies.

Keep FastAPI-specific objects out of domain/business functions when practical.

## FastAPI rules

- Keep route handlers thin.
- Parse transport input with Pydantic models and FastAPI dependencies.
- Delegate business behavior to service functions/classes.
- Return typed response models.
- Use explicit status codes.
- Use dependency injection for request-scoped resources such as DB sessions and current user.
- Keep endpoint paths stable and predictable.
- Prefer versioned API prefixes such as `/api/v1` for externally consumed APIs.
- Do not catch `Exception` in every route.
- Translate known application/domain errors centrally with exception handlers.
- Do not expose raw SQL/database errors to clients.

Separate schemas by purpose when semantics differ:

```text
UserCreate
UserUpdate
UserRead
UserListItem
```

Do not reuse an ORM model as the API schema.

Use `ConfigDict(from_attributes=True)` when Pydantic must validate ORM instances.

## SQLAlchemy 2.x rules

Use SQLAlchemy 2.x style consistently:

- `Mapped[...]`.
- `mapped_column(...)`.
- `relationship(...)` with explicit typing.
- `select(...)`, `update(...)`, and `delete(...)`.
- `await session.execute(...)`.
- `result.scalars()`, `scalar_one()`, `scalar_one_or_none()` as appropriate.
- `async_sessionmaker` for async sessions.

Avoid legacy `Query`.

Prefer database constraints for invariants that the database can enforce:

- unique constraints;
- foreign keys;
- non-null constraints;
- check constraints where useful.

Add indexes deliberately for real access patterns. Do not add indexes reflexively to every column.

For timestamps, choose and consistently use timezone-aware UTC semantics.

For enums, make migration behavior explicit. Consider string/check-constraint storage when enum values may evolve frequently.

### Relationship loading

Avoid accidental N+1 queries.

Choose loading strategy intentionally:

- `selectinload` for collections in many common API cases;
- `joinedload` for suitable singular relationships;
- explicit projections when the endpoint needs only a subset of columns.

Do not solve N+1 problems by enabling eager loading globally.

## Async database behavior

Never call blocking database or network APIs from async route execution.

Use one request-scoped `AsyncSession` unless a use case requires another explicit scope.

Do not share an `AsyncSession` concurrently across independent tasks.

Be explicit about transaction ownership.

Preferred rule:

- repositories execute queries and may `flush`;
- repositories do not commit;
- the use-case/service boundary owns commit/rollback;
- read-only operations do not commit.

This keeps multi-step operations atomic.

Use `flush()` when an ID or database-generated value is needed before commit.

Do not use `commit()` as a way to "make SQLAlchemy update the object".

## Repository guidance

Create a repository only when it adds value:

- the query is reused;
- persistence behavior is non-trivial;
- the service would otherwise contain database plumbing;
- tests benefit from a persistence boundary.

A repository should expose intent-oriented operations, not mirror every SQL primitive.

Prefer:

```python
await users.get_by_email(email)
await users.list_active(page=page)
```

over a generic repository abstraction with dozens of untyped filters.

For simple CRUD modules, direct service-level SQLAlchemy queries are acceptable if that is the repository convention.

## Alembic rules

Treat every schema change as a migration.

Before creating a migration:

1. Update SQLAlchemy metadata/models.
2. Ensure Alembic `env.py` imports the correct metadata.
3. Generate a revision when appropriate.
4. Review the generated upgrade and downgrade manually.
5. Run the migration against a realistic PostgreSQL database.
6. Run application tests after migration.

Never assume autogenerated migrations are correct.

Check carefully for:

- unintended table/column drops;
- type conversions that require `USING`;
- server defaults;
- enum changes;
- constraint/index naming;
- nullable changes on populated tables;
- renamed columns detected as drop + add.

Never modify an already-deployed migration to change production history. Create a new revision.

Use deterministic constraint/index naming conventions where the project supports them.

For destructive migrations, use an expand/migrate/contract strategy when zero-downtime deployment matters.

Examples:

- add nullable column;
- deploy code capable of writing both forms;
- backfill;
- enforce constraint in a later migration.

Keep large data backfills out of a long schema-locking transaction when operational risk is significant.

## API pagination and filtering

For lists:

- define explicit pagination parameters;
- enforce sane limits;
- use deterministic ordering;
- validate sort/filter fields;
- do not interpolate untrusted field names into SQL.

Prefer cursor pagination for large, frequently changing datasets where offset pagination becomes expensive or unstable. Use offset pagination when simplicity is more valuable and the dataset is moderate.

## Concurrency and consistency

Do not rely on a pre-check alone for uniqueness or race-sensitive invariants.

Use database constraints and handle integrity errors at the correct boundary.

Use row locks only when the business invariant truly requires them.

For counters, balances, allocation, inventory, or other concurrent updates, reason about lost updates explicitly.

## Configuration and secrets

Use typed settings.

- Read configuration from environment variables.
- Keep secrets out of source control.
- Separate development defaults from production requirements.
- Fail fast for missing production secrets.
- Do not call `os.getenv` throughout business code.

Keep DSNs, CORS origins, external API URLs, and security settings centralized.

## Authentication and authorization

Do not add an authentication scheme unless the application requires one.

When auth exists:

- authenticate in a dedicated dependency/security layer;
- authorize at the use-case/route boundary;
- do not trust user IDs or roles sent by the client;
- keep authorization rules testable;
- store password hashes only, using a maintained password hashing implementation;
- do not log secrets, credentials, session tokens, or authorization headers.

For browser-only applications, prefer secure HttpOnly cookie/session approaches when they fit the deployment model. If bearer tokens are required, implement their lifecycle explicitly.

## Errors

Use stable application error semantics.

Prefer a small typed error hierarchy such as:

```text
ApplicationError
├── NotFoundError
├── ConflictError
├── ValidationError
└── ForbiddenError
```

Map these centrally to HTTP responses.

Include a machine-readable error code when frontend logic needs to branch on an error. Do not make frontend behavior depend on English error text.

## Logging and observability

Use structured logging where the project supports it.

Include useful correlation fields:

- request ID;
- route;
- status;
- duration;
- authenticated subject ID when safe.

Never log credentials or sensitive request bodies.

Expose health/readiness endpoints according to deployment needs. Readiness may verify required dependencies; liveness should stay lightweight.

## Testing

Test behavior at the cheapest useful level.

### Unit tests

Use for:

- pure validation;
- business rules;
- calculations;
- permission logic;
- complex transformations.

Avoid mocking SQLAlchemy internals.

### Integration tests

Prefer integration tests for:

- repository queries;
- transactions;
- constraints;
- migrations;
- FastAPI endpoints;
- authentication wiring.

Use PostgreSQL for database integration tests when PostgreSQL-specific behavior matters. Do not assume SQLite is equivalent.

For API tests, exercise the ASGI app using httpx.

Cover:

- success;
- validation failure;
- not found;
- conflict;
- authorization;
- transaction rollback;
- database constraint behavior.

### Migration tests

For significant schema work, verify:

1. migration from the previous expected schema;
2. application startup;
3. representative reads/writes;
4. downgrade only if downgrade is a supported operational path.

## Performance

Do not optimize from intuition alone.

Inspect:

- query count;
- SQL shape;
- indexes;
- payload size;
- serialization cost;
- repeated external calls.

Use database-side aggregation/filtering instead of loading large datasets into Python.

Do not add caching until the consistency and invalidation rules are understood.

## Code quality

- Add precise type annotations.
- Keep functions focused.
- Prefer explicit code over framework magic.
- Avoid premature generic abstractions.
- Keep public interfaces small.
- Delete dead paths after a completed migration/refactor when safe.
- Preserve backward compatibility unless the task explicitly changes it.

## Completion checklist

Before considering backend work complete:

1. Run formatter/linter.
2. Run static type checking if configured.
3. Run targeted tests.
4. Run the broader backend test suite when feasible.
5. Verify Alembic heads are sane when migrations changed.
6. Apply migrations to a clean/test database when migrations changed.
7. Inspect generated OpenAPI when API contracts changed.
8. Report migration, compatibility, and operational consequences clearly.
