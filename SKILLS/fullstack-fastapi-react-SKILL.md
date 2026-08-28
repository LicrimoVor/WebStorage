---
name: fullstack-fastapi-react
description: Coordinate end-to-end web application work across a FastAPI + Pydantic + SQLAlchemy + Alembic + PostgreSQL backend and a React + TypeScript + Feature-Sliced Design + SCSS + Gravity UI frontend. Use when a task crosses the API boundary: new features spanning backend and frontend, OpenAPI contract changes, generated TypeScript clients, authentication flows, validation/error contracts, migrations with UI impact, end-to-end testing, Docker/dev environment, deployment compatibility, or full-stack refactors. Use together with the specialized backend and frontend skills when they are available.
---

# Full-Stack FastAPI + React

Treat the backend/frontend boundary as a contract, not as two independently guessed implementations.

This skill coordinates:

- `fastapi-sqlalchemy-backend`;
- `react-gravity-fsd`.

When both specialized skills are installed and the task spans both sides, apply their rules as well.

## Target stack

Backend:

- FastAPI.
- Pydantic v2.
- SQLAlchemy 2.x async.
- Alembic.
- PostgreSQL.

Frontend:

- React + TypeScript.
- Vite.
- Feature-Sliced Design.
- SCSS Modules.
- Gravity UI.
- React Router.
- One consistent server-state solution.

Contract:

- FastAPI OpenAPI schema is the machine-readable source of truth.
- Generate TypeScript API types/client artifacts from OpenAPI when the repository supports generation.

## First actions

For a cross-stack task:

1. Identify the user-visible behavior.
2. Locate the owning backend module and frontend FSD slice.
3. Inspect the existing API contract and generated-client workflow.
4. Inspect similar end-to-end behavior.
5. Determine whether a database migration is required.
6. Determine compatibility requirements for rolling deployments.
7. Plan changes in contract-first order.

Do not start by independently coding frontend mocks and backend endpoints with different assumptions.

## Contract-first workflow

For a new or changed API capability:

1. Define the backend request/response semantics.
2. Define validation and error semantics.
3. Update database model/migration if needed.
4. Implement backend behavior.
5. Verify generated OpenAPI.
6. Regenerate TypeScript types/client.
7. Implement frontend API adapter/query.
8. Implement entity/feature UI.
9. Add backend integration tests.
10. Add frontend tests.
11. Add or update E2E coverage for the complete flow.

Do not manually patch generated API files.

Do not hand-write TypeScript duplicates of Pydantic request/response models when generated contract types are available.

## OpenAPI

Keep operation contracts deterministic.

Use stable:

- operation IDs when the generator relies on them;
- schema names;
- enum values;
- response status codes;
- pagination shapes;
- error structures.

Avoid anonymous, unstable response shapes for important endpoints.

Inspect schema diffs when changing API models.

Treat an OpenAPI breaking change as a product/API change even if Python still type-checks.

## Generated TypeScript client

Prefer a generated layer such as:

```text
frontend/src/shared/api/generated/
```

or the repository's existing equivalent.

Generated code should be isolated from handwritten application logic.

Handwritten layers should adapt generated transport primitives into application-friendly functions/hooks.

Example:

```text
shared/api/generated      # generated transport/client/types
entities/User/api         # user-owned query adapters
features/EditProfile/api  # use-case mutation adapter
```

Do not put generated code directly into React components.

Pin the generator and make generation reproducible.

Add a CI check that detects stale generated client artifacts when practical.

## Transport vs domain models

Do not force transport DTOs to become frontend domain models.

Use generated DTOs at the boundary.

Map them when the frontend needs:

- parsed dates;
- view-specific shape;
- stable local discriminated unions;
- renamed domain concepts;
- normalized entities.

Keep mappings close to the owning entity API/lib layer.

## Error contract

Use a consistent machine-readable error shape.

If the project has no existing error contract, prefer a Problem Details style response with:

- HTTP status;
- stable machine-readable code/type;
- human-readable detail;
- optional field-level validation details;
- optional request/correlation identifier.

Frontend logic must branch on stable codes/status, not English message text.

Map:

- 400/422 to validation/input behavior;
- 401 to authentication flow;
- 403 to permission behavior;
- 404 to not-found state;
- 409 to conflict state;
- 5xx/network failures to recoverable application error UI.

Preserve backend error details only when safe to expose.

## Validation

Validate on both sides for different reasons.

Frontend validation improves interaction.

Backend validation enforces the contract and remains authoritative.

Do not rely on hidden/disabled frontend controls for security.

When backend field errors exist, map them to frontend form fields where possible.

Keep constraints consistent:

- length;
- requiredness;
- enum options;
- ranges;
- date rules.

Prefer deriving constraints from shared/generated schema metadata only when the toolchain supports this cleanly. Otherwise test key parity explicitly.

## Database migrations and frontend rollout

When a feature requires a schema change, reason about deployment ordering.

For rolling/zero-downtime deployments, prefer backward-compatible phases.

Example:

1. add nullable/new database field;
2. deploy backend accepting old and new clients;
3. deploy frontend using the new field;
4. backfill data;
5. enforce non-null/cleanup in a later release.

Avoid requiring frontend and backend to switch at the exact same millisecond.

Never remove an API field before deployed clients have stopped depending on it unless coordinated downtime/versioning is intentional.

## Authentication

Treat authentication as an end-to-end system.

Define:

- login/session establishment;
- expiration;
- refresh/re-authentication behavior;
- logout;
- 401 handling;
- CSRF requirements when cookies are used;
- role/permission behavior.

Frontend route guards improve UX but are not authorization.

Backend authorization is authoritative.

Do not store sensitive tokens in unsafe browser storage merely for convenience when a safer deployment-compatible mechanism exists.

## CORS and origins

For local development, configure explicit known origins.

Do not use wildcard CORS with credentials.

For production, prefer a same-origin reverse-proxy deployment when it simplifies security and operations.

Keep frontend API base URL environment-driven and centralized.

## Pagination, filtering, sorting

Define list contract semantics once.

Keep URL state, frontend query keys, and backend query parameters aligned.

Use:

- deterministic sort;
- maximum page size;
- explicit filter names;
- stable response metadata.

Frontend should put shareable filters/sort/page state in the URL when appropriate.

Query cache keys must include all parameters that affect results.

## Dates and time zones

Prefer ISO 8601 over custom date formats.

Persist and transport instants with explicit timezone semantics, usually UTC.

Do not silently interpret a timezone-naive backend datetime as local browser time.

Format dates for users at the presentation boundary.

## IDs and numeric precision

Do not assume all backend integers are safely representable as JavaScript numbers.

For potentially large 64-bit identifiers, consider string representation in the API contract.

For monetary values, define precision semantics explicitly. Avoid floating-point money calculations in either layer.

## File upload/download

For uploads:

- validate content type and size on backend;
- do not trust the browser MIME type alone;
- expose upload progress only if the transport supports it.

For downloads:

- set correct content type and disposition;
- handle auth and error responses before treating the body as a file.

## Realtime behavior

When adding WebSocket/SSE behavior:

- define reconnection semantics;
- identify event versioning;
- handle missed updates;
- reconcile realtime events with server-state cache;
- keep normal HTTP source-of-truth endpoints when appropriate.

Do not add realtime infrastructure for data that tolerates ordinary refetching.

## Development environment

For a new project, prefer a reproducible local environment.

Typical:

```text
docker compose
├── postgres
├── backend
└── optional supporting services
```

The frontend may run via Vite on the host for fast HMR or in a container when repository policy prefers full containerization.

Provide environment examples without secrets.

Automate:

- database startup;
- migrations;
- backend startup;
- frontend startup;
- API client generation.

Do not hide destructive database reset behavior inside ordinary startup scripts.

## Testing strategy

### Backend

Test endpoint + PostgreSQL behavior with integration tests.

### Frontend

Test model/UI behavior with unit/component tests.

### Contract

Add generation/schema checks when feasible.

### E2E

Use Playwright for critical full-stack journeys.

Prefer real backend + isolated test database for high-value E2E flows.

Mock only external services or exceptional conditions that are impractical to reproduce.

Critical flows may include:

- login/logout;
- create/edit/delete;
- permission boundaries;
- pagination/filtering;
- validation conflicts;
- recovery after request failure.

## End-to-end feature ownership

Map backend modules to frontend business ownership conceptually, not by identical folder names.

Example:

```text
Backend module: users
Frontend entity: User
Frontend feature: EditUser
Frontend page: UserDetailsPage
```

Keep API mechanics in the entity/feature API segment rather than leaking endpoint URLs into page components.

## Observability across the boundary

Propagate or expose correlation/request IDs when useful.

Frontend error reporting should include safe context:

- route;
- operation;
- request/correlation ID;
- application version.

Backend logs should allow the same request to be traced.

Do not expose server stack traces to the browser.

## Security review for cross-stack changes

Check:

- backend authorization;
- frontend UX for denied actions;
- input validation;
- output escaping;
- CSRF when relevant;
- CORS;
- file handling;
- secrets;
- sensitive fields accidentally serialized;
- mass-assignment/update schemas;
- object-level permission checks.

Do not rely on TypeScript types as a security boundary.

## CI quality gates

For a full-stack repository, prefer CI gates that cover:

Backend:

```text
ruff
typecheck
pytest
alembic validation
```

Frontend:

```text
typecheck
eslint
stylelint
unit/component tests
build
```

Cross-stack:

```text
OpenAPI generation freshness
critical E2E
```

Fail CI when generated API artifacts are stale if generation is committed to the repository.

## Full-stack refactoring

Do not rewrite both sides at once without a migration path.

Use compatibility seams:

- additive API fields;
- dual-read/write transitions;
- adapter functions;
- deprecated endpoints with explicit removal plan;
- feature flags when warranted.

Delete transitional paths after rollout.

## Completion checklist

Before finishing a cross-stack task:

1. Database migration is safe and reviewed if required.
2. Backend API behavior is tested.
3. OpenAPI reflects intended contract.
4. Generated frontend API artifacts are current.
5. Frontend uses generated contract types where intended.
6. FSD boundaries are respected.
7. Gravity UI and SCSS conventions are respected.
8. Validation/error semantics align across both sides.
9. Auth/permissions are enforced on backend.
10. Critical end-to-end behavior is tested.
11. Builds and linters pass on both sides.
12. Compatibility/deployment ordering is documented when non-trivial.
