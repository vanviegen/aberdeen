# Routing and Dispatching

## Router (`aberdeen/route`)

The `current` object is a reactive proxy of the current URL state.

### Properties
| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | Normalized path (e.g., `/users/123`) |
| `p` | `string[]` | Path segments (e.g., `['users', '123']`) |
| `search` | `Record<string,string>` | Query parameters |
| `hash` | `string` | URL hash including `#` |
| `state` | `Record<string,any>` | JSON-compatible state data |
| `nav` | `NavType` | How we got here: `load`, `back`, `forward`, `go`, `push` |
| `depth` | `number` | Navigation stack depth (starts at 1) |

### Navigation Functions
```typescript
import * as route from 'aberdeen/route';

route.go('/users/42');                    // Navigate to new URL
route.go({ p: ['users', 42], hash: 'top' }); // Object form
route.push({ search: { tab: 'feed' } });  // Merge into current route
route.back();                             // Go back in history
route.back({ path: '/home' });            // Back to matching entry, or replace
route.up();                               // Go up one path level
route.persistScroll();                    // Save/restore scroll position
```

### Reactive Routing Example
```typescript
import * as route from 'aberdeen/route';

$(() => {
    const [section, id] = route.current.p;
    if (section === 'users') drawUser(id);
    else if (section === 'settings') drawSettings();
    else drawHome();
});
```

## Dispatcher (`aberdeen/dispatcher`)

Type-safe path segment matching for complex routing.

```typescript
import { Dispatcher, matchRest } from 'aberdeen/dispatcher';
import * as route from 'aberdeen/route';

const d = new Dispatcher();

// Literal string match
d.addRoute('home', () => drawHome());

// Number extraction (uses built-in Number function)
d.addRoute('user', Number, (id) => drawUser(id));

// String extraction
d.addRoute('user', Number, 'post', String, (userId, postId) => {
    drawPost(userId, postId);
});

// Rest of path as array
d.addRoute('search', matchRest, (terms: string[]) => {
    performSearch(terms);
});

// Dispatch in reactive scope
$(() => {
    if (!d.dispatch(route.current.p)) {
        draw404();
    }
});
```

### Custom Matchers
```typescript
const uuid = (s: string) => /^[0-9a-f-]{36}$/.test(s) ? s : matchFailed;
d.addRoute('item', uuid, (id) => drawItem(id));
```
