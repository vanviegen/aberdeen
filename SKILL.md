---
name: aberdeen
description: Expert guidance for building reactive UIs with the Aberdeen library. Covers element creation, reactive proxy state, efficient list rendering, CSS shortcuts, UI components, routing, transitions, and optimistic updates.
---

Aberdeen is a reactive UI library using fine-grained reactivity via JavaScript Proxies. No virtual DOM, no build step required.

# Guidance for AI Assistants

1. **Never concatenate user data** - Use `A('input value=', data)` not `A('input value=${data}')`
2. **Pass observables directly** - Use `text=', ref(obj, 'key')` to avoid parent scope subscriptions
3. **Use `onEach` for lists** - Never iterate proxy arrays with `for`/`map` in render functions
4. **Class instances are great** - Better than plain objects for typed, structured state
5. **CSS shortcuts** - Use $3, $4 for spacing (1rem, 2rem), $primary for colors (assuming setVarSpacingCssVars is used and cssVars colors are defined)
6. **Minimal scopes** - Smaller reactive scopes = fewer DOM updates
7. **Function components** - Create reusable UI components as regular functions starting with 'draw' (like drawMainMenu(settings) or drawProfilePage(user))
8. **Prefix proxied objects** - As a convention, prefix variable names that contain proxied objects with '$' (e.g. `$user`, `$settings`)
9. **Think about rerenders** - When you read from a proxied object (like `let n = $user.name;`), the containing A(() => {..}) or A('div', () => {}) function will rerun on change - plan on which level you want updates to trigger

# Obtaining info

The complete tutorial follows below. For detailed API reference open these files within the skill directory:

- **[aberdeen](aberdeen.md)** - Core: `A`, `proxy`, `onEach`, `ref`, `derive`, `map`, `multiMap`, `partition`, `count`, `isEmpty`, `peek`, `dump`, `clean`, `insertCss`, `insertGlobalCss`, `mount`, `runQueue`, `darkMode`
- **[route](route.md)** - Routing: `current`, `go`, `push`, `back`, `up`, `persistScroll`
- **[dispatcher](dispatcher.md)** - Path matching: `Dispatcher`, `MATCH_REST`, `MATCH_FAILED`
- **[transitions](transitions.md)** - Animations: `grow`, `shrink`
- **[prediction](prediction.md)** - Optimistic UI: `applyPrediction`, `applyCanon`

