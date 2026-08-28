---
name: react-gravity-fsd
description: Build, extend, refactor, review, and test React + TypeScript applications using Feature-Sliced Design, SCSS Modules, Gravity UI, Vite, typed routing, and a deliberate server/client state split. Use for React pages, widgets, features, entities, shared UI, routing, API integration, state management, SCSS architecture, Gravity UI components and theming, Storybook, frontend tests, performance, accessibility, and frontend project structure. The architecture is intentionally based on the strong patterns from https://github.com/LicrimoVor/FrontendLearning while modernizing its technology choices.
---

# React + Gravity UI + Feature-Sliced Design

Build scalable React applications around explicit business slices and stable public APIs.

Use `FrontendLearning` as the architectural reference:

https://github.com/LicrimoVor/FrontendLearning

Preserve its strongest ideas:

- Feature-Sliced Design layers.
- Clear `app / pages / widgets / features / entities / shared` boundaries.
- Slice-local `model`, `ui`, `api`, `lib`, and test concerns.
- Public APIs through `index.ts`.
- Dedicated testing exports when needed.
- App-level providers and routing.
- Lazy-loading boundaries.
- Strict linting and import discipline.
- Component documentation and multiple levels of testing.
- Server-state tooling separated from presentational components.

Modernize the implementation around Gravity UI, SCSS Modules, current React/TypeScript, and Vite.

## Core stack

Use the project's installed versions. For a new project, prefer:

- React 19 when ecosystem compatibility allows it.
- TypeScript with strict mode.
- Vite.
- React Router.
- SCSS + CSS Modules.
- Gravity UI:
  - `@gravity-ui/uikit`;
  - `@gravity-ui/icons`;
  - `@gravity-ui/navigation` when an application shell is needed;
  - `@gravity-ui/date-components` for date controls;
  - `@gravity-ui/table` for advanced data grids;
  - `@gravity-ui/charts` for charts.
- A single consistent server-state solution.
- Vitest + React Testing Library.
- Playwright for E2E.
- Storybook for reusable UI and meaningful feature states.
- ESLint.
- Stylelint for SCSS.

Do not introduce Tailwind CSS.

Do not introduce a second design system when Gravity UI can solve the requirement.

## First actions

Before editing frontend code:

1. Inspect `package.json`, TypeScript config, Vite config, ESLint, Stylelint, routing, and app providers.
2. Identify whether the repository already follows FSD and preserve its layer/slice naming.
3. Inspect one similar slice and its `index.ts` public API.
4. Inspect installed Gravity UI package versions.
5. If `@gravity-ui/uikit` is installed, read its agent documentation at:

```text
node_modules/@gravity-ui/uikit/build/docs/INDEX.md
```

6. Consult installed package types and Storybook/examples before inventing a Gravity UI prop.
7. Determine which state library and server-state library the repository already uses before adding another.

Repository conventions override this skill when they are coherent and intentional.

## Architecture

Use these FSD layers:

```text
src/
├── app/
├── pages/
├── widgets/
├── features/
├── entities/
└── shared/
```

Dependency direction:

```text
app
↓
pages
↓
widgets
↓
features
↓
entities
↓
shared
```

A layer may import only from layers below it.

Examples:

- `features` may import `entities` and `shared`.
- `entities` may import only `shared`.
- `shared` must not import business slices.
- `pages` may compose widgets/features/entities.
- `app` wires providers, routing, global styles, and application startup.

Avoid arbitrary cross-imports between slices on the same layer.

If same-layer collaboration is genuinely required, prefer redesigning the ownership boundary. Use an explicit cross-import API only when the architecture clearly benefits from it.

## Layer responsibilities

### `app`

Keep application-wide wiring here:

```text
app/
├── providers/
│   ├── router/
│   ├── theme/
│   ├── query/
│   └── store/       # only if global client state exists
├── styles/
├── config/
└── App.tsx
```

Examples:

- `ThemeProvider`;
- error boundary;
- router provider/config;
- query client provider;
- global state provider;
- application-wide feature flags;
- root error handling;
- global CSS/SCSS imports.

Do not put reusable business entities in `app`.

### `pages`

A page is a route-level composition boundary.

Pages should:

- compose widgets/features/entities;
- own route-specific layout;
- parse route params/search params;
- trigger page-level data requirements when appropriate;
- stay lazy-loadable.

Pages should not become large domain service containers.

Prefer:

```text
pages/
└── UserDetailsPage/
    ├── ui/
    │   └── UserDetailsPage.tsx
    └── index.ts
```

### `widgets`

Widgets are large reusable page sections that compose lower layers.

Examples:

- application header;
- sidebar;
- user dashboard summary;
- filter + list area;
- complex form section;
- page toolbar.

A widget is not a dumping ground for arbitrary components.

### `features`

A feature represents a user action or business capability.

Examples:

- `AuthByUsername`;
- `EditProfile`;
- `ChangeTheme`;
- `ArticleRating`;
- `DeleteUser`;
- `InviteMember`.

A feature may contain:

```text
FeatureName/
├── api/
├── lib/
├── model/
├── ui/
├── index.ts
└── testing.ts       # only when useful
```

Do not create a feature for every visual component.

### `entities`

An entity represents a business concept.

Examples:

- User;
- Profile;
- Article;
- Comment;
- Notification.

A typical entity slice:

```text
entities/
└── User/
    ├── api/
    ├── model/
    │   ├── types.ts
    │   ├── selectors.ts
    │   └── ...
    ├── ui/
    │   ├── UserCard/
    │   └── UserAvatar/
    ├── lib/
    ├── index.ts
    └── testing.ts
```

Keep entity UI semantically tied to the entity.

### `shared`

`shared` contains reusable non-business-specific code:

```text
shared/
├── api/
├── assets/
├── config/
├── lib/
├── routes/
├── types/
└── ui/
```

Good examples:

- HTTP client primitives;
- environment config;
- date helpers;
- generic hooks;
- route utilities;
- generic layout primitives;
- reusable product-agnostic UI compositions.

Do not move business code to `shared` merely because two features need it. First ask whether it belongs to an entity or a higher-level slice.

## Slice segments

Use segments according to responsibility:

### `ui`

React components and component-local styles.

### `model`

Client-side state, selectors, model types, state machines, derived logic.

Do not put arbitrary HTTP calls in `model`.

### `api`

Server communication owned by the slice.

Keep endpoint/query definitions close to the entity or feature that owns the contract.

### `lib`

Slice-specific pure helpers, hooks, adapters, formatting, and mapping.

Do not turn `lib` into a second `shared`.

### `config`

Slice-specific static configuration where needed.

### `testing.ts`

Expose stable testing fixtures/builders/mocks when other tests need them.

This mirrors the reference project's explicit testing API idea.

## Public API

Every slice should expose consumers through `index.ts`.

Import from the slice public API:

```ts
import {UserCard, type User} from '@/entities/User';
```

Avoid deep imports:

```ts
import {UserCard} from '@/entities/User/ui/UserCard/UserCard';
```

Allow deep imports only inside the same slice.

Keep `index.ts` deliberate. Do not export every internal helper by default.

Use `testing.ts` for test-only exports rather than polluting runtime public APIs.

## Import aliases

Prefer stable aliases such as:

```text
@/app
@/pages
@/widgets
@/features
@/entities
@/shared
```

Keep Vite, TypeScript, tests, and Storybook aliases synchronized.

Add lint rules to enforce layer boundaries when practical.

## Gravity UI rules

Gravity UI is the default design system.

Before building a custom primitive, check Gravity UI.

Use UIKit for standard:

- buttons;
- inputs;
- selects;
- dialogs;
- popovers;
- menus;
- tabs;
- labels;
- text;
- loaders;
- alerts;
- tooltips;
- pagination;
- simple tables.

Use specialized Gravity UI packages for their intended domains.

Do not recreate a Button/Input/Modal/Tooltip design system in `shared/ui`.

Create `shared/ui` components when they add product semantics or repeated composition, not merely to rename every Gravity UI component.

Good wrapper:

```text
shared/ui/ConfirmActionDialog
```

if the application repeatedly needs a consistent confirmation workflow.

Usually unnecessary wrapper:

```text
shared/ui/AppButton
```

that only forwards every prop to `@gravity-ui/uikit/Button`.

### Gravity UI API correctness

Do not guess APIs from Material UI, Ant Design, or shadcn.

Examples of common Gravity UI specifics:

- `Button` uses `view`, not `variant`.
- `Icon` receives imported icon data rather than a string `name`.

Always prefer:

1. installed TypeScript declarations;
2. installed agent docs;
3. installed package README/docs;
4. official Gravity UI documentation.

## Theme setup

Import Gravity UI base styles once in the application entry:

```ts
import '@gravity-ui/uikit/styles/fonts.css';
import '@gravity-ui/uikit/styles/styles.css';
```

Render the application inside `ThemeProvider`.

Support the themes required by the product, including dark mode when specified.

Use semantic Gravity UI CSS variables in application SCSS.

Prefer:

```scss
.card {
  color: var(--g-color-text-primary);
  background: var(--g-color-base-generic);
  border: 1px solid var(--g-color-line-generic);
  border-radius: var(--g-border-radius-l);
}
```

Avoid hard-coded color values when a semantic token exists.

Application code should consume the semantic color layer, not private palette variables.

Keep brand/theme overrides centralized under `app/styles` or a dedicated app theme file.

Do not scatter `--g-*` redefinitions across feature components.

## SCSS rules

Use SCSS Modules for component and slice styles:

```text
UserCard.tsx
UserCard.module.scss
```

Use global SCSS only for:

- root/reset behavior not provided by the design system;
- global application layout;
- typography setup;
- theme/brand token overrides;
- truly global utility contracts.

Do not use Tailwind.

Do not use global selectors to reach into unrelated feature components.

Prefer shallow selectors.

Prefer:

```scss
.root {}
.header {}
.content {}
```

over deeply nested chains.

Use nesting only when it improves readability.

Avoid `!important` unless overriding a third-party limitation that cannot be solved through the supported API.

Prefer Gravity UI CSS variables and component props over brittle internal-selector overrides.

## Component design

Prefer small, typed components with explicit responsibilities.

Use composition over large configurable mega-components.

Props rules:

- define explicit prop types;
- avoid `any`;
- avoid passing whole store slices when a component needs two fields;
- pass callbacks for actions;
- keep transport DTOs out of purely presentational UI when mapping is useful.

Keep components pure when possible.

Do not mirror props into state without a reason.

Do not use `useEffect` for values that can be derived during render.

Do not wrap everything in `useMemo` or `useCallback`. Add memoization for measured or structurally obvious value.

## State management

Do not choose global state by habit.

Classify state first.

### Local UI state

Use `useState` / `useReducer` for:

- local dialogs;
- tabs;
- ephemeral input state;
- toggles;
- local wizard steps.

### URL state

Use route/search params for shareable/navigation state:

- filters;
- sort;
- pagination;
- selected tab when URL semantics matter.

### Server state

Use one server-state solution consistently.

Preferred choices:

- TanStack Query when no global Redux requirement exists;
- RTK Query when Redux Toolkit is already a central application dependency.

Do not copy server responses into a second client store without a concrete reason.

### Global client state

Introduce only for true cross-application client state.

Acceptable choices depend on project conventions:

- Redux Toolkit;
- Zustand;
- a focused Context + reducer.

If using Redux Toolkit, preserve good ideas from the reference project:

- keep state colocated with the owning feature/entity;
- normalize large reusable collections with `createEntityAdapter` when it improves access/update behavior;
- consider dynamic reducer injection for large lazy slices if bundle/runtime architecture benefits;
- keep selectors close to the model;
- avoid a giant global `store/slices` directory.

Do not use Redux for every request simply because Redux exists.

## API architecture

Keep API ownership in FSD slices.

Examples:

```text
entities/User/api/userApi.ts
features/EditProfile/api/updateProfile.ts
```

Prefer generated DTO/types from the backend OpenAPI contract when available.

Do not manually duplicate backend schemas when generated types are part of the project.

Add mapping at the API boundary when transport DTOs and UI/domain models should differ.

Keep request construction out of UI components.

UI components should consume query/mutation hooks or use-case hooks.

## Routing

Keep root routing under `app/providers/router`.

Prefer a typed route configuration rather than route strings scattered through the app.

Centralize route builders:

```ts
getUserRoute(userId)
getArticleRoute(articleId)
```

Lazy-load route pages.

Use route metadata for concerns such as:

- authentication requirement;
- permissions/roles;
- layout;
- feature flags.

Provide:

- Not Found route;
- route-level suspense/loading state;
- route-level error behavior;
- authorization behavior.

Do not put authorization solely in hidden buttons. Protect the route/action and rely on backend authorization as the source of truth.

## Error boundaries and loading

Have an application-level error boundary.

Use localized error boundaries for independently recoverable heavy widgets when appropriate.

Differentiate:

- initial loading;
- background refetch;
- empty state;
- permission denied;
- not found;
- request error.

Use Gravity UI feedback components when available.

Do not show a full-page loader for every small mutation.

## Forms

Prefer a form library only when form complexity justifies it.

For small forms, controlled or native React patterns are acceptable.

For larger forms, React Hook Form is a good default if not otherwise standardized.

Keep:

- transport errors;
- field validation;
- submit state;
- business errors

semantically distinct.

Map backend field errors to fields when the API contract supports this.

Use Gravity UI form controls.

## Internationalization

If the application is multilingual, keep translation setup at app/shared configuration level and translation keys near the owning domain according to project convention.

Do not hard-code user-facing strings in reusable features when i18n is enabled.

Configure Gravity UI's own language consistently with the application locale.

## Accessibility

Rely on Gravity UI's accessibility support but do not assume composition is automatically accessible.

Check:

- accessible names for icon-only buttons;
- labels for form fields;
- heading hierarchy;
- keyboard navigation;
- focus behavior after dialogs/drawers;
- contrast in custom SCSS;
- loading announcements where needed.

Do not remove visible focus styles.

## Performance

Start with architectural wins:

- lazy route pages;
- lazy heavy widgets;
- virtualize genuinely large lists;
- avoid duplicated server state;
- avoid N+1 client request patterns;
- keep slice public APIs tree-shakeable where practical.

Measure before micro-optimizing.

Use virtualization only for sufficiently large lists/tables.

Prefer pagination/server filtering for large datasets when appropriate.

## Storybook

Add stories for reusable UI and meaningful feature states.

Cover states such as:

- default;
- loading;
- empty;
- error;
- disabled;
- long text;
- narrow layout;
- dark theme when relevant.

Do not create trivial stories that provide no documentation value.

Use mock API tooling supported by the project.

## Testing

Use a layered test strategy inspired by the reference project but with current tools.

### Unit tests

Use Vitest for:

- pure model logic;
- selectors;
- adapters;
- formatting;
- validation.

### Component tests

Use React Testing Library.

Test behavior, accessible output, and user actions.

Do not test internal implementation details.

### Storybook/visual tests

Use Storybook for reusable component states.

Add visual regression when the product benefits from it.

### E2E

Use Playwright for critical flows:

- authentication;
- navigation;
- high-value forms;
- permissions;
- destructive actions;
- important list/detail flows.

Avoid reproducing every unit-level edge case in E2E.

## Test helpers

Provide app-aware render helpers under shared testing infrastructure:

```text
shared/lib/testing/renderWithProviders
```

Allow tests to configure:

- route;
- theme;
- locale;
- query client;
- store state if one exists;
- authenticated user.

Expose slice fixtures from `testing.ts` when consumers need them.

## Linting and boundaries

Enforce:

- TypeScript/React lint rules;
- hooks rules;
- import order if standardized;
- FSD layer boundaries;
- no forbidden deep imports;
- SCSS linting;
- accessibility linting where practical.

Treat architecture lint failures as design feedback rather than disabling the rule immediately.

## Feature implementation workflow

For a new user-facing capability:

1. Identify the business owner: entity or feature.
2. Identify route/page composition.
3. Define/update backend-generated API contract types if applicable.
4. Put server communication in the owning slice `api`.
5. Put domain/client state in `model` only if needed.
6. Build UI from Gravity UI first.
7. Add only product-specific SCSS in a colocated module.
8. Export through the slice `index.ts`.
9. Compose into a widget or page.
10. Add tests at the appropriate levels.
11. Add Storybook coverage for reusable/complex UI.
12. Run typecheck, lint, Stylelint, tests, and build.

## Refactoring rules

When refactoring a legacy React application toward this architecture:

- move one coherent slice at a time;
- keep temporary compatibility APIs explicit;
- avoid a repository-wide rewrite unless requested;
- add public APIs before fixing imports;
- move business ownership upward/downward deliberately;
- eliminate `shared` dumping grounds gradually;
- do not mix a design-system migration with unrelated state rewrites unless necessary.

## Completion checklist

Before finishing frontend work:

1. TypeScript passes.
2. ESLint passes.
3. Stylelint passes when configured.
4. Targeted unit/component tests pass.
5. E2E tests are updated for changed critical behavior.
6. Production build succeeds.
7. New imports obey FSD boundaries.
8. Slice exports go through public APIs.
9. Gravity UI APIs match the installed version.
10. New SCSS uses semantic Gravity UI tokens where applicable.
11. Light/dark behavior is checked when themes are supported.
12. Loading, empty, error, and permission states are handled where relevant.
