---
name: aberdeen
description: Expert guidance for building reactive UIs with the Aberdeen library. Covers element creation with $, reactive state with proxy(), efficient lists with onEach(), two-way binding, CSS shortcuts, and advanced features like routing, transitions, and optimistic updates.
---

# Aberdeen

Reactive UI library using fine-grained reactivity via JS Proxies. No virtual DOM.

## Imports
```typescript
import { $, proxy, onEach, ref, mount, insertCss, insertGlobalCss, cssVars, derive, map, multiMap, partition, count, isEmpty, clean, invertString } from 'aberdeen';
import { grow, shrink } from 'aberdeen/transitions';  // Optional
import * as route from 'aberdeen/route';              // Optional
```

## Element Creation: `$`
```typescript
// Tag, classes, text content
$('div.container.active#Hello World');

// Nested elements in single call (each becomes child of previous)
$('div.wrapper mt:@3 span.icon');

// Attributes/properties via string syntax (preferred)
$('input placeholder=Name value=initial');

// Dynamic values: end key with `=`, next arg is value
$('input placeholder="Something containing spaces" value=', userInput);
$('button text=', `Count: ${state.count}`);

// Event handlers
$('button text=Click click=', () => console.log('clicked'));

// Nested content via function (creates reactive scope)
$('ul', () => {
    $('li#Item 1');
    $('li#Item 2');
});
```

**Never concatenate user data into strings.** Use dynamic syntax:
```typescript
// WRONG - XSS risk and breaks on special chars
$(`input value=${userData}`);

// CORRECT
$('input value=', userData);
```

### String Syntax Reference
| Syntax | Meaning |
|--------|--------|
| `tag` | Element name (creates child, becomes current element) |
| `.class` | Add CSS class |
| `#text` | Text content (rest of string) |
| `prop:value` | Inline CSS style |
| `attr=value` | Attribute with static string value |
| `prop:` or `attr=` | Next argument is CSS prop/attribute/property/event listener |

### Object Syntax (alternative)
```typescript
// Equivalent to string syntax, useful for complex cases
// Note how the '$' prefix is used for CSS properties
$('input', { placeholder: 'Name', value: userData, $color: 'red' });
$('button', { click: handler, '.active': isActive });
```

### CSS Property Shortcuts
| Short | Full | Short | Full |
|-------|------|-------|------|
| `m` | margin | `p` | padding |
| `mt`,`mb`,`ml`,`mr` | marginTop/Bottom/Left/Right | `pt`,`pb`,`pl`,`pr` | paddingTop/... |
| `mv` | marginTop + marginBottom | `pv` | paddingTop + paddingBottom |
| `mh` | marginLeft + marginRight | `ph` | paddingLeft + paddingRight |
| `w` | width | `h` | height |
| `bg` | background | `fg` | color |
| `r` | borderRadius | | |

### CSS Variables (`@`)
Values starting with `@` expand to native CSS custom properties via `var(--name)`. Numeric keys are prefixed with `m` (e.g., `@3` → `var(--m3)`).

Predefined spacing scale:
| Var | CSS Output | Value |
|-----|------------|-------|
| `@1` | `var(--m1)` | 0.25rem |
| `@2` | `var(--m2)` | 0.5rem |
| `@3` | `var(--m3)` | 1rem |
| `@4` | `var(--m4)` | 2rem |
| `@5` | `var(--m5)` | 4rem |
| `@n` | `var(--mn)` | 2^(n-3) rem |

**Best practice:** Use `@3` and `@4` for most margins/paddings. For new projects, define color variables:
```typescript
cssVars.primary = '#3b82f6';
cssVars.danger = '#ef4444';
$('button bg:@primary fg:white#Save'); // outputs: background: var(--primary); color: white;
```

## Reactive State: `proxy()`
```typescript
// Objects (preserves type!)
const state = proxy({ name: 'Alice', count: 0 });

// Primitives get wrapped in { value: T }
const flag = proxy(true);
flag.value = false;

// Class instances work great - use for typed state!
class Todo {
    constructor(public text: string, public done = false) {}
    toggle() { this.done = !this.done; }
}
const todo: Todo = proxy(new Todo('Learn Aberdeen'));
todo.toggle(); // Reactive method call!

// Arrays
const items = proxy<string[]>([]);
items.push('new');
delete items[0];
```

## Reactive Scopes
Functions passed to `$` create **scopes**. When proxy data accessed inside changes:
1. All effects from previous run are **cleaned** (DOM elements removed, `clean()` callbacks run)
2. Function re-runs

```typescript
$('div', () => {
    // Re-runs when state.name changes, replacing the h1
    $(`h1#Hello ${state.name}`);
});
```

### Granular Updates
Split scopes for minimal DOM updates:
```typescript
$('div', () => {
    $('h1', () => $(`#${state.title}`));  // Only title text re-renders
    $('p', () => $(`#${state.body}`));    // Only body text re-renders
    // Or
    $('p#', ref(state, 'body'));    // Two-way maps {body: x} to {value: x}, which will be read reactively by $
});
```

### Passing Observables Directly
Avoid subscribing in parent scope:
```typescript
$('div', () => {
    // Not great: reruns this scope when state.count changes
    $('span text=', state.count);  // Subscribes here!
});

$('div', () => {
    // Good: only text node updates, this function does not rerun
    $('span text=', ref(state, 'count'));  // Passes observable, subscribes internally
});
```

Or just use a single-value proxy `const count = proxy(0);` and pass it directly `$('span text=', count);`.

### Manual Cleanup with `clean()`
Register cleanup for non-$ side effects:
```typescript
$(() => {
    if (!reactive.value) return;
    const timer = setInterval(() => console.log('tick'), 1000);
    clean(() => clearInterval(timer));  // Runs on scope cleanup
});
```

## Lists: `onEach()`
```typescript
onEach(items, (item, index) => {
    $('li', () => $(`#${item.text}`));
}, item => item.id);  // Optional sort key
```
- Renders only changed items efficiently
- Sort key: `number | string | [number|string, ...]` or `undefined` to hide item
- Use `invertString(str)` for descending string sort
- Works on arrays, objects, and Maps

## Two-Way Binding
```typescript
$('input bind=', ref(state, 'name'));
$('input type=checkbox bind=', ref(state, 'active'));
$('select bind=', ref(state, 'choice'), () => {
    $('option value=a#Option A');
    $('option value=b#Option B');
});
```

## Derived Values

### `derive()` - Derived primitives
```typescript
const doubled: { value: number } = derive(() => state.count * 2);
$('span text=', doubled);
```

### Collection functions
```typescript
// count() - returns { value: number } proxy
const total: { value: number } = count(items);

// isEmpty() - returns boolean, re-runs scope only when emptiness changes
if (isEmpty(items)) $('p#No items');

// map() - returns proxied array/object of same shape
const names: string[] = map(users, u => u.active ? u.name : undefined);

// multiMap() - each input produces multiple outputs
const byId: Record<string, User> = multiMap(users, u => ({ [u.id]: u }));

// partition() - sort items into buckets
const byStatus: Record<string, Record<number, Task>> = partition(tasks, t => t.status);
```

## Component-Local CSS
`insertCss` returns a unique class name (e.g., `.AbdStl1`). Call at **module top-level**, not inside render functions:
```typescript
// At top of file
const boxStyle = insertCss({
    bg: '@primary',
    r: '@2',
    button: {
        m: '@2',
        '&:hover': { opacity: 0.8 }
    }
});

// In render code
$('div', boxStyle, 'button#Click');
```

For global styles (no class prefix):
```typescript
insertGlobalCss({
    body: { m: 0, fontFamily: 'system-ui' },
    'a': { fg: '@primary' }
});
```

CSS can be reactive when needed (e.g., theme switching):
```typescript
$(() => {
    insertCss({ bg: theme.dark ? '#222' : '#fff' });
});
```

## Transitions
The `create` and `destroy` properties enable enter/leave animations:
```typescript
import { grow, shrink } from 'aberdeen/transitions';

// Built-in grow/shrink for smooth height/width animations
onEach(items, item => {
    $('li create=', grow, 'destroy=', shrink, `#${item.text}`);
});

// CSS class-based transitions
$('div create=.fade-in destroy=.fade-out#Animated');
// On create: class added briefly then removed (after layout)
// On destroy: class added, element removed after 2s delay
```

Only triggers for **top-level** elements of a (re-)running scope, not deeply nested children.

## HTML Conversion Tool
Convert HTML to Aberdeen syntax:
```bash
echo '<div class="box"><p>Hello</p></div>' | npx html-to-aberdeen
# Output: $('div.box', () => { $('p#Hello'); });
```

## Advanced Features
- **Routing**: [references/routing.md](references/routing.md) - Browser history routing and path dispatching
- **Transitions**: [references/transitions.md](references/transitions.md) - Detailed animation patterns
- **Predictions**: [references/prediction.md](references/prediction.md) - Optimistic UI with auto-revert

## Best Practices
1. **Type everything:** Use TypeScript. `proxy()` preserves types; class instances work great.
2. **Use CSS variables:** Define `@primary`, `@secondary`, etc. in `cssVars` for colors.
3. **Use spacing scale:** Prefer `@3`, `@4` for margins/paddings over hardcoded values, for consistency and easy theming/scaling. Don't use when exact pixel values are needed.
4. **Minimize scope size:** Smaller reactive scopes = fewer DOM updates.
5. **Use `onEach` for lists:** Never iterate proxied arrays with `for`/`map` in render functions.
6. **Pass observables directly:** `$('span text=', observable)` not interpolation.
7. **Components are functions:** Just write functions that call `$`.
8. **Top-level CSS:** Call `insertCss` at module level, not in render functions.
9. **Dynamic values:** Always use `attr=', value` syntax for user data.
