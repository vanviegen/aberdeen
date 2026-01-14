# Transitions

Animate elements entering/leaving the DOM via the `create` and `destroy` properties.

**Important:** Transitions only trigger for **top-level** elements of a scope being (re-)run. Deeply nested elements drawn as part of a larger redraw do not trigger transitions.

## Built-in Transitions

```typescript
import { grow, shrink } from 'aberdeen/transitions';

// Apply to individual elements
$('div create=', grow, 'destroy=', shrink, '#Animated');

// Common with onEach for list animations
onEach(items, item => {
    $('li create=', grow, 'destroy=', shrink, `#${item.text}`);
});
```

- `grow`: Scales element from 0 to full size with margin animation
- `shrink`: Scales element to 0 and removes from DOM after animation

Both detect horizontal flex containers and animate width instead of height.

## CSS-Based Transitions

For custom transitions, use CSS class strings (dot-separated):
```typescript
const fadeStyle = insertCss({
    transition: 'all 0.3s ease-out',
    '&.hidden': { opacity: 0, transform: 'translateY(-10px)' }
});

// Class added briefly on create (removed after layout)
// Class added on destroy (element removed after 2s delay)
$('div', fadeStyle, 'create=.hidden destroy=.hidden#Fading element');
```

## Custom Transition Functions

For full control, pass functions. For `destroy`, your function must remove the element:
```typescript
$('div create=', (el: HTMLElement) => {
    // Animate on mount - element already in DOM
    el.animate([{ opacity: 0 }, { opacity: 1 }], 300);
}, 'destroy=', (el: HTMLElement) => {
    // YOU must remove the element when done
    el.animate([{ opacity: 1 }, { opacity: 0 }], 300)
        .finished.then(() => el.remove());
}, '#Custom animated');
```
