---
name: ias-prototype-frontend
description: Conventions for the Vue 3 + Vite frontends under the ias_prototype* family (ias_prototype/ias_frontend, and any sibling prototype stacks such as ias_prototype_alia). Use when building or editing any of these frontends - component structure, styling rules, store/router patterns.
---

# IAS prototype frontends (`ias_prototype*/ias_frontend/`)

Each prototype stack (`ias_prototype/`, `ias_prototype_alia/`, ...) has its own
self-contained Vue 3 + Vite frontend, structured the same way:

```
src/
  main.js
  App.vue              - RouterView + global toast stack + ConfirmDialog
  router/index.js       - route table + auth guard
  api/client.js         - axios instance, 401 interceptor
  services/socket.js     - Socket.IO client (only if the stack has live push data)
  stores/                - Pinia: auth.js, toast.js, confirm.js, + one per domain
  assets/styles.css      - ALL shared design tokens and component classes
  layouts/AppShell.vue   - header/nav, mounted once for authenticated routes
  components/            - reusable pieces, grouped by domain (e.g. dam/, ui/)
  views/                 - one per route
```

## Styling rule: CSS lives in `.css` files, never hardcoded in the markup

- Every design token (colors, spacing, fonts, radii) and every reusable class
  (`.panel`, `.btn`, `.badge`, `.card-value`, etc.) belongs in
  `src/assets/styles.css`, imported once in `main.js`. Components consume
  these classes - they do not redefine colors or spacing inline.
- Component-specific layout that isn't reusable goes in that component's own
  `<style scoped>` block, using `var(--token-name)` from `styles.css` - never
  a raw hex/px value duplicated from memory.
- **Do not** use inline `style="..."` attributes for anything that expresses
  a design decision (color, spacing, font). A `style` attribute is acceptable
  only for a value that is genuinely computed at runtime and cannot be a
  class (e.g. a canvas-driven width, a dynamic `--pin` custom property value
  set from JS for a map marker) - and even then, the *properties* it sets
  should reference tokens, not hardcode a color.
- **Do not** paste a full `<style>` block of copy-pasted rules into a new
  view when the same visual pattern already exists in `styles.css` - extend
  the shared stylesheet instead, so every view stays visually consistent and
  a token change (e.g. rebranding an accent color) only needs one edit.
- If a page needs a genuinely new pattern, add the classes to `styles.css`
  (with the other component definitions, in the relevant section) rather
  than inventing scoped, one-off styling that only that view uses.

This mirrors how `ias_prototype/ias_frontend/src/assets/styles.css` already
works: one file owns every token and shared class; `AppShell.vue` and each
view/component only add scoped rules for their own unique layout, always
through `var(--token)` references.

## Auth pattern (when the stack has login)

- `stores/auth.js`: token + user in `localStorage`, Pinia getters for
  `isAuthenticated`/`role`/role-based capability checks, `expiresAt` derived
  from the JWT's own `exp` claim (see `utils/jwt.js`) for a session countdown.
- `router/index.js`: `beforeEach` guard redirects unauthenticated access to
  `/login`, honors `meta.roles` for admin-only routes, sets `document.title`
  in `afterEach`.
- Confirmation dialogs (logout, delete) go through `stores/confirm.js` +
  `components/ui/ConfirmDialog.vue` - never a native `confirm()`/`alert()`.

## Verifying changes

- `npm run build` (Vite) catches template/import errors across every `.vue`
  file - run it before rebuilding the Docker image.
- No test suite - verify by rebuilding the frontend container and checking
  the browser, or curl the built `dist/` output through the dev server.
