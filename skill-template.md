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

@@include skill/tutorial.md

# API Reference

The sections below summarize each module's exports; the linked `.md` files within this skill directory contain detailed reference docs for individual symbols.

## Core (aberdeen)

Import as `import A from 'aberdeen'`. `A` is itself a callable function for building reactive DOM (creating elements, setting attributes, adding content); every other Aberdeen function is also available as a property on it (e.g. `A.proxy`, `A.onEach`).

@@include skill/aberdeen.md

## Routing (aberdeen/route)

@@include skill/route.md

## Path matching (aberdeen/dispatcher)

@@include skill/dispatcher.md

## Optimistic UI (aberdeen/prediction)

@@include skill/prediction.md

## Transitions (aberdeen/transitions)

@@include skill/transitions.md
