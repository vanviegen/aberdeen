---
name: aberdeen
description: Expert guidance for building reactive UIs with the Aberdeen library. Covers element creation, reactive state management, efficient list rendering, CSS integration, routing, transitions, and optimistic updates.
---

Aberdeen is a reactive UI library using fine-grained reactivity via JavaScript Proxies. No virtual DOM, no build step required.

# Guidance for AI Assistants

1. **Use string syntax by default** - `$('div.box#Hello')` is more concise than object syntax
2. **Never concatenate user data** - Use `$('input value=', data)` not `$('input value=${data}')`
3. **Pass observables directly** - Use `text=', ref(obj, 'key')` to avoid parent scope subscriptions
4. **Use `onEach` for lists** - Never iterate proxy arrays with `for`/`map` in render functions
5. **Class instances are great** - Better than plain objects for typed, structured state
6. **CSS shortcuts** - Use `@3`, `@4` for spacing (1rem, 2rem), `@primary` for colors
7. **Minimal scopes** - Smaller reactive scopes = fewer DOM updates

# Obtaining info

The complete tutorial follows below. For detailed API reference open these files within the skill directory:

- **[aberdeen](aberdeen.md)** - Core: `$`, `proxy`, `onEach`, `ref`, `derive`, `map`, `multiMap`, `partition`, `count`, `isEmpty`, `peek`, `dump`, `clean`, `insertCss`, `mount`, `runQueue`
- **[route](route.md)** - Routing: `current`, `go`, `push`, `back`, `up`, `persistScroll`
- **[dispatcher](dispatcher.md)** - Path matching: `Dispatcher`, `matchRest`, `matchFailed`
- **[transitions](transitions.md)** - Animations: `grow`, `shrink`
- **[prediction](prediction.md)** - Optimistic UI: `applyPrediction`, `applyCanon`
