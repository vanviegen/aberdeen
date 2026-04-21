---
name: aberdeen
description: "Expert guidance for building reactive UIs with the Aberdeen library. Covers element creation, reactive proxy state, efficient list rendering with onEach, scoped CSS shortcuts, client-side routing, DOM transitions, and optimistic updates. Use when the user works with Aberdeen, Aberdeen.js, or asks about building reactive frontends without a virtual DOM."
---

Aberdeen is a reactive UI library for TypeScript/JavaScript using fine-grained reactivity via ES6 Proxies. No virtual DOM, no build step, no JSX — direct DOM updates with automatic dependency tracking.

# Quick Start

```typescript
import A from 'aberdeen';

const state = A.proxy({ count: 0 });

A('div', () => {
    A('h2', () => A('text=', `Count: ${state.count}`));
    A('button text=+ click=', () => state.count++);
    A('button text=- click=', () => state.count--);
});
```

# Key Patterns — Correct vs Incorrect

```typescript
// ✅ Use onEach for reactive lists — only rerenders changed items
A.onEach(items, drawItem, item => item.name);

// ❌ Never iterate proxy arrays directly in render — rerenders everything
for (const item of items) { drawItem(item); }
```

```typescript
// ✅ Pass data as trailing argument — subscribes only the text node
A('span text=', A.ref(state, 'name'));

// ❌ String interpolation — subscribes entire parent scope
A(`span text=${state.name}`);
```

# Building a Reactive Component

1. **Create state** — `const state = A.proxy({ items: [] });`
2. **Mount root** — `A('div', () => { ... });` to create an observer scope
3. **Render lists** — `A.onEach(state.items, drawItem, item => item.sortKey);`
4. **Bind inputs** — `A('input bind=', A.ref(state, 'field'));`
5. **Style locally** — `const style = A.insertCss({ "&": "bg:$primary p:$3" });`

# Guidance for AI Assistants

1. **Use string syntax by default** — `A('div.box#Hello')` is more concise than object syntax
2. **Never concatenate user data** — Use `A('input value=', data)` not `A('input value=${data}')`
3. **Pass observables directly** — Use `A('span text=', A.ref(obj, 'key'))` to avoid parent scope subscriptions
4. **Use `onEach` for lists** — Never iterate proxy arrays with `for`/`map` in render functions
5. **Class instances work well** — Better than plain objects for typed, structured state
6. **CSS shortcuts** — Use `$3`, `$4` for spacing (1rem, 2rem), `$primary` for colors
7. **Minimal scopes** — Smaller reactive scopes = fewer DOM updates

# Obtaining Info

The complete tutorial follows below. For detailed API reference open these files within the skill directory:

- **[aberdeen](aberdeen.md)** — Core: `A`, `proxy`, `onEach`, `ref`, `derive`, `map`, `multiMap`, `partition`, `count`, `isEmpty`, `peek`, `dump`, `clean`, `insertCss`, `insertGlobalCss`, `mount`, `runQueue`, `darkMode`
- **[route](route.md)** — Routing: `current`, `go`, `push`, `back`, `up`, `persistScroll`
- **[dispatcher](dispatcher.md)** — Path matching: `Dispatcher`, `MATCH_REST`, `MATCH_FAILED`
- **[transitions](transitions.md)** — Animations: `grow`, `shrink`
- **[prediction](prediction.md)** — Optimistic UI: `applyPrediction`, `applyCanon`
