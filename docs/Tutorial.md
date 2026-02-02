---
title: Tutorial
---

# Tutorial

## Creating elements

This is a complete Aberdeen application:

```javascript
import {$} from 'aberdeen';
$('h3#Hello world');
```

It adds a `<h3>Hello world</h3>` element to the `<body>` (which is the default mount point).

The {@link aberdeen.$} function accepts various forms of arguments, which can be combined.

When a string is passed:
- The inital part (if any) is the name of the element to be created.
- One or multiple CSS classes can be added to the 'current' element, by prefixing them with a `.`.
- Content text can be added by prefixing it with a `#`.

Instead of the `#` prefix for text content, you can also use the `text=` property, like this: `$('h3 text="Hello world"')`. The double quotes are needed here only because our text contains a space.

For simple formatting, use `rich=` which supports `*italic*`, `**bold**`, `` `code` ``, and `[links](url)`:

```javascript
$('p rich="This is *italic*, **bold**, and `code` with a [link](/path)."');
```

`$()` can accept multiple strings, so the following lines are equivalent:

```javascript
$('button.outline.secondary#Pressing me does nothing!');
$('button', '.outline', '.secondary', '#Pressing me does nothing!');
```

Also, we can create multiple nested DOM elements in a single {@link aberdeen.$} invocation, *if* the parents need to have only a single child. For instance:

```javascript
$('div.box', '#Text within the div element...', 'input');
```

Note that you can play around, modifying any example while seeing its live result by pressing the *Edit* button that appears when hovering over an example!

In order to pass in additional properties and attributes to the 'current' DOM element, we can use the `key=value` or `key=`, value syntax. So to extend the above example:

```javascript
$('div.box id=cityContainer input value=London placeholder=City');
```

Note that `value` doesn't become an HTML attribute. This (together with `selectedIndex`) is one of two special cases, where Aberdeen applies it as a DOM property instead, in order to preserve the variable type (as attributes can only be strings).

When a value ends with `=`, the next argument is used as its value. This is used for dynamic values and event listeners. So to always log the current input value to the console you can do:

```javascript
$('div.box input value=Marshmallow input=', el => console.log(el.target.value));
```

Note that the example is interactive - try typing something!

> **Note:** {@link aberdeen.$} also accepts object syntax as an alternative to strings (see the API reference), but the string syntax shown here is more concise and is recommended for most use cases.

## Inline styles

To set inline CSS styles on elements, use the `property:value` (short form) or `property: value containing spaces;` (long form) syntax:

```javascript
$('p color:red padding:8px background-color:#a882 border: 2px solid #a884; #Styled text');
```

### Property shortcuts

Aberdeen provides shortcuts for commonly used CSS properties, making your code more concise.

| Shortcut | Expands to |
|----------|------------|
| `m`, `mt`, `mb`, `ml`, `mr` | `margin`, `margin-top`, `margin-bottom`, `margin-left`, `margin-right` |
| `mv`, `mh` | Vertical (top+bottom) or horizontal (left+right) margins |
| `p`, `pt`, `pb`, `pl`, `pr` | `padding`, `padding-top`, `padding-bottom`, `padding-left`, `padding-right` |
| `pv`, `ph` | Vertical or horizontal padding |
| `w`, `h` | `width`, `height` |
| `bg` | `background` |
| `fg` | `color` |
| `r` | `border-radius` |

```javascript
$('div mv:10px ph:20px bg:lightblue r:10% #Styled box');
```

### CSS variables

Values starting with `$` expand to native CSS custom properties via `var(--name)`. The {@link aberdeen.cssVars} object offers a convenient way of setting and updating CSS custom properties at the `:root` level.

When you add the first property to `cssVars`, Aberdeen automatically creates a reactive `<style>` tag in `<head>` containing the CSS custom property declarations.

```javascript
import { $, cssVars } from 'aberdeen';

cssVars.primary = '#3b82f6';
cssVars.danger = '#ef4444';
cssVars.textLight = '#f8fafc';

$('button bg:$primary fg:$textLight #Primary');
$('button bg:$danger fg:$textLight #Danger');
```

The above generates CSS like `background: var(--primary)` and automatically injects a `:root` style defining the actual values. Since this uses native CSS custom properties, changes to `cssVars` automatically propagate to all elements using those values.

### Spacing variables

You can optionally initialize `cssVars` with keys `1` through `12` mapping to an exponential `rem` scale using {@link aberdeen.setSpacingCssVars}. Since CSS custom property names can't start with a digit, numeric keys are prefixed with `m` (e.g., `$3` becomes `var(--m3)`):

```javascript
import { setSpacingCssVars } from 'aberdeen';

setSpacingCssVars(); // Default: base=1, unit='rem'
// Or customize: setSpacingCssVars(16, 'px') or setSpacingCssVars(1, 'em')
```

| Value | CSS Output | Result (default) |
|-------|------------|------------------|
| `$1` | `var(--m1)` | 0.25rem |
| `$2` | `var(--m2)` | 0.5rem |
| `$3` | `var(--m3)` | 1rem |
| `$4` | `var(--m4)` | 2rem |
| `$5` | `var(--m5)` | 4rem |
| ... | ... | 2^(n-3) rem |

```javascript
$('div mt:$3 ph:$4 #This text has 1rem top margin, 2rem left+right padding');
```

If you want different spacing, you can customize the base and unit when calling `setSpacingCssVars()`, or dynamically modify the values.

These shortcuts and variables are also available when using {@link aberdeen.insertCss}.

## Nesting content
Of course, putting everything in a single {@link aberdeen.$} call will get messy soon, and you'll often want to nest more than one child within a parent. To do that, you can pass in a *content* function to {@link aberdeen.$}, like this:

```javascript
$('div.box.row id=cityContainer', () => {
    $('input value=London placeholder=City');
    $('button text=Confirm click=', () => alert("You got it!"));
});
```

Why are we passing in a function instead of just, say, an array of children? I'm glad you asked! :-) For each such function Aberdeen will create an *observer*, which will play a major part in what comes next...

## Observable objects
Aberdeen's reactivity system is built around observable objects. These are created using the {@link aberdeen.proxy} function:

When you access properties of a proxied object within an observer function (the function passed to {@link aberdeen.$}), Aberdeen automatically tracks these dependencies. If the values change later, the observer function will re-run, updating only the affected parts of the DOM.

```javascript
import { $, proxy } from 'aberdeen';

const user = proxy({
    name: 'Alice',
    age: 28,
    city: 'Aberdeen',
});

$('div', () => {
    $(`h3#Hello, ${user.name}!`);
    $(`p#You are ${user.age} years old.`);
});

setInterval(() => {
    user.name = 'Bob';
    user.age++;
}, 2000);
```

As the content function of our `div` is subscribed to both `user.name` and `user.age`, modifying either of these would trigger a re-run of that function, first undoing any side-effects (most notably: inserting DOM elements) of the earlier run. If, however `user.city` is changed, no re-run would be triggered as the function is not subscribed to that property.

So if either property changes, both the `<h3>` and `<p>` are recreated as the inner most observer function tracking the changes is re-run. If you want to redraw on an even granular level, you can of course:

```javascript
const user = proxy({
    name: 'Alice',
    age: 28,
});

$('div', () => {
    $(`h3`, () => {
        console.log('Name draws:', user.name)
        $(`#Hello, ${user.name}!`);
    });
    $(`p`, () => {
        console.log('Age draws:', user.age)
        $(`#You are ${user.age} years old.`);
    });
});

setInterval(() => {
    user.age++;
}, 2000);
```

Now, updating `user.name` would only cause the *Hello* text node to be replaced, leaving the `<div>`, `<h3>` and `<p>` elements as they were.

## Conditional rendering

Within an observer function (such as created by passing a function to {@link aberdeen.$}), you can use regular JavaScript logic. Like `if` and `else`, for instance:

```javascript
const user = proxy({
    loggedIn: false
});

$('div', () => {
    if (user.loggedIn) {
        $('button.outline text=Logout click=', () => user.loggedIn = false);
    } else {
        $('button text=Login click=', () => user.loggedIn = true);
    }
});
```

## Observable primitive values

The {@link aberdeen.proxy} method wraps an object in a JavaScript [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy). As this doesn't work for primitive values (like numbers, strings and booleans), the method will *create* an object in order to make it observable. The observable value is made available as its `.value` property.

```javascript
const cnt = proxy(42);
$('div.row', () => {
    // This scope will not have to redraw
    $('button text=- click=', () => cnt.value--);
    $('div text=', cnt);
    $('button text=+ click=', () => cnt.value++);
});
```

The reason the `div.row` scope doesn't redraw when `cnt.value` changes is that we're passing the entire `cnt` observable object to the `text:` property. Aberdeen then internally subscribes to `cnt.value` for just that text node, ensuring minimal updates.

If we would have done `$('div', {text: count.value});` instead, we *would* have subscribed to `count.value` within the `div.row` scope, meaning we'd be redrawing the two buttons and the div every time the count changes.

This also works for other properties, such as inline styles:

```javascript
import { $, proxy } from 'aberdeen';

const textColor = proxy('blue');

$('div.box color:', textColor, '#Click me to change color', 'click=', () => {
    textColor.value = textColor.value === 'blue' ? 'red' : 'blue';
});
```

This way, when `textColor.value` changes, only the style is updated without recreating the element.


## Observable arrays

You can create observable arrays too. They work just like regular arrays, apart from being observable.

```javascript
const items = proxy([1, 2, 3]);

$('h3', () => {
    // This subscribes to the length of the array and to the value at `items.length-1` in the array.
    $('#Last item: '+items[items.length-1]);
})

$('ul', () => {
    // This subscribes to the entire array, and thus redraws all <li>s when any item changes.
    // In the next section, we'll learn about a better way.
    for (const item of items) {
        $(`li#Item ${item}`);
    }
});

$('button text=Add click=', () => items.push(items.length+1));
```

## TypeScript and classes

Though this tutorial mostly uses plain JavaScript to explain the concepts, Aberdeen is written in and aimed towards TypeScript.

Class instances, like any other object, can be proxied to make them reactive.

```typescript
class Widget {
    constructor(public name: string, public width: number, public height: number) {}
    grow() { this.width *= 2; }
    toString() { return `${this.name}Widget (${this.width}x${this.height})`; }
}

let graph: Widget = proxy(new Widget('Graph', 200, 100));

$('h3', () => $('#'+graph));
$('button text=Grow click=', () => graph.grow());
```

The type returned by {@link aberdeen.proxy} matches the input type, meaning the type system does not distinguish proxied and unproxied objects. That makes sense, as they have the exact same methods and properties (though proxied objects may have additional side effects).


## Efficient list rendering with onEach
For rendering lists efficiently, Aberdeen provides the {@link aberdeen.onEach} function. It takes three arguments:
1. The array to iterate over.
2. A render function that receives the item and its index.
3. An optional order function, that returns the value by which the item is to be sorted. By default, the output is sorted by array index.

```javascript
import { $, proxy, onEach } from 'aberdeen';

const items = proxy([]);

const randomInt = (max) => parseInt(Math.random() * max);
const randomWord = () => Math.random().toString(36).substring(2, 12).replace(/[0-9]+/g, '').replace(/^\w/, c => c.toUpperCase());

// Make random mutations
setInterval(() => {
    if (randomInt(3)) items[randomInt(7)] = {label: randomWord(), prio: randomInt(4)};
    else delete items[randomInt(7)];
}, 500);

$('div.row.wide height:250px', () => {
    $('div.box#By index', () => {
        onEach(items, (item, index) => {
            // Called only for items that are created/updated
            $(`li#${item.label} (prio ${item.prio})`)
        });
    })
    $('div.box#By label', () => {
        onEach(items, (item, index) => {
            $(`li#${item.label} (prio ${item.prio})`)
        }, item => item.label);
    })
    $('div.box#By desc prio, then label', () => {
        onEach(items, (item, index) => {
            $(`li#${item.label} (prio ${item.prio})`)
        }, item => [-item.prio, item.label]);
    })
})
```

We can also use {@link aberdeen.onEach} to reactively iterate over *objects*. In that case, the render and order functions receive `(value, key)` instead of `(value, index)` as their arguments.

```javascript
const pairs = proxy({A: 'Y', B: 'X',});

const randomWord = () => Math.random().toString(36).substring(2, 12).replace(/[0-9]+/g, '').replace(/^\w/, c => c.toUpperCase());

$('button text="Add item" click=', () => pairs[randomWord()] = randomWord());

$('div.row.wide margin-top:1em', () => {
    $('div.box#By key', () => {
        onEach(pairs, (value, key) => {
            $(`li#${key}: ${value}`)
        });
    })
    $('div.box#By desc value', () => {
        onEach(pairs, (value, key) => {
            $(`li#${key}: ${value}`)
        }, value => invertString(value));
    })
})
```

Note the use of the provided {@link aberdeen.invertString} function to reverse-sort by a string value.

## Two-way binding
Aberdeen makes it easy to create two-way bindings between form elements (the various `<input>` types, `<textarea>` and `<select>`) and your data, by passing an observable object with a `.value` as `bind:` property to {@link aberdeen.$}.

To bind to object properties not named .value (e.g., user.name), use {@link aberdeen.ref}. This creates a new observable proxy whose .value property directly maps to the specified property (e.g., name) on your original observable object (e.g., user).

```javascript
import { $, proxy, ref } from 'aberdeen';

const user = proxy({
    name: 'Alice',
    active: false
});

// Text input binding
$('input placeholder=Name bind=', ref(user, 'name'));

// Checkbox binding
$('label', () => {
    $('input type=checkbox bind=', ref(user, 'active'));
}, '#Active');

// Display the current state
$('div.box', () => {
    $(`p#Name: ${user.name} `, () => {
        // Binding works both ways
        $('button.outline.secondary#!', {
            click: () => user.name += '!'
        });
    });
    $(`p#Status: ${user.active ? 'Active' : 'Inactive'}`);
});
```

## CSS
Through the {@link aberdeen.insertCss} function, Aberdeen provides a way to create component-local CSS.

For simple single-element styles, you can pass a string directly:

```javascript
import { $, insertCss } from 'aberdeen';

const simpleCard = insertCss("bg:#f0f0f0 p:$3 r:8px");
$('div', simpleCard, '#Card content');
```

For more complex styles with nested selectors, pass an object where each key is a selector and each value is a style string using the same `property:value` syntax as inline styles:

```javascript
import { $, insertCss } from 'aberdeen';

// Create a CSS class that can be applied to elements
const myBoxStyle = insertCss({
    "&": "border-color:#6936cd background-color:#1b0447",
    "button": "background-color:#6936cd border:0 transition: box-shadow 0.3s; box-shadow: 0 0 4px #ff6a0044;",
    "button:hover": "box-shadow: 0 0 16px #ff6a0088;"
});

// myBoxStyle is now something like ".AbdStl1", the name for a generated CSS class.
// Here's how to use it:
$('div.box', myBoxStyle, 'button#Click me');
```

The `"&"` selector refers to the element with the generated class itself. Child selectors like `"button"` are scoped to descendants of that element, while pseudo-selectors like `"&:hover"` apply to the element itself.

This allows you to create single-file components with advanced CSS rules. The {@link aberdeen.insertGlobalCss} function can be used to add CSS without a class prefix - it accepts the same string or object syntax.

Both functions support the same CSS shortcuts and variables as inline styles (see above). For example:

```javascript
import { cssVars, insertGlobalCss } from 'aberdeen';
cssVars.boxBg = '#f0f0e0';
insertGlobalCss({
    "body": "m:0", // Using shortcut for margin
    "form": "bg:$boxBg mv:$3" // Using background shortcut, CSS variable, and spacing value
});
```

Of course, if you dislike JavaScript-based CSS and/or prefer to use some other way to style your components, you can just ignore this Aberdeen function.

## Transitions
Aberdeen allows you to easily apply transitions on element creation and element destruction:

```javascript
let titleStyle = insertCss({
    "&": "transition: all 1s ease-out; transform-origin: left center;",
    "&.faded": "opacity:0",
    "&.imploded": "transform:scale(0.1)",
    "&.exploded": "transform:scale(5)"
});

const show = proxy(true);
$('label', () => {
    $('input type=checkbox bind=', show);
    $('#Show title');
});
$(() => {
    if (!show.value) return;
    $('h2#(Dis)appearing text', titleStyle, 'create=faded.imploded destroy=faded.exploded');
});
```

- The creation transition works by briefly adding the given CSS classes on element creation, and immediately removing them after the initial browser layout has taken place.
- The destruction transition works by delaying the removal of the element from the DOM by two seconds (currently hardcoded - should be enough for any reasonable transition), while adding the given CSS classes.

Though this approach is easy (you just need to provide some CSS), you may require more control over the specifics, for instance in order to animate the layout height (or width) taken by the element as well. (Note how the document height changes in the example above are rather ugly.) For this, `create` and `destroy` may be functions instead of CSS class names. For more control, create and destroy can also accept functions. While custom function details are beyond this tutorial, Aberdeen offers ready-made {@link transitions.grow} and {@link transitions.shrink} transition functions (which also serve as excellent examples for creating your own):

```javascript
import { $, proxy, onEach } from 'aberdeen';
import { grow, shrink } from 'aberdeen/transitions';

const items = proxy([]);

const randomInt = (max) => parseInt(Math.random() * max);
const randomWord = () => Math.random().toString(36).substring(2, 12).replace(/[0-9]+/g, '').replace(/^\w/, c => c.toUpperCase());

// Make random mutations
setInterval(() => {
    if (randomInt(3)) items[randomInt(7)] = {label: randomWord(), prio: randomInt(4)};
    else delete items[randomInt(7)];
}, 500);

$('div.row.wide height:250px', () => {
    $('div.box#By index', () => {
        onEach(items, (item, index) => {
            $(`li#${item.label} (prio ${item.prio})`, {create: grow, destroy: shrink})
        });
    })
    $('div.box#By label', () => {
        onEach(items, (item, index) => {
            $(`li#${item.label} (prio ${item.prio})`, {create: grow, destroy: shrink})
        }, item => item.label);
    })
    $('div.box#By desc prio, then label', () => {
        onEach(items, (item, index) => {
            $(`li#${item.label} (prio ${item.prio})`, {create: grow, destroy: shrink})
        }, item => [-item.prio, item.label]);
    })
});
```

## Advanced: Peeking without subscribing

Sometimes you need to read reactive data inside an observer scope without creating a subscription to that data. The {@link aberdeen.peek} function allows you to do this:

```javascript
import { $, proxy, peek } from 'aberdeen';

const data = proxy({ a: 1, b: 2 });

$(() => {
    // This scope only re-runs when data.a changes
    // Changes to data.b won't trigger a re-render
    $(`h2#a == ${data.a} && b == ${peek(data, 'b')}`);
});

$(`button text="a++ (will update)" click=`, () => data.a++);
$(`button ml:1rem text="b++ (won't update)" click=`, () => data.b++);
```

You can also pass a function to `peek()` to execute it without any subscriptions:

```javascript
const a = proxy(42);
const b = proxy(7);
const sum = peek(() => a.value + b.value); // Reads both without subscribing
$('#Sum is: '+sum);
setInterval(() => a.value++, 1000); // Won't update
```

This can be useful to avoid rerenders (of even rerender loops) when you only need a point-in-time snapshot of some reactive data.

## Derived values
An observer scope doesn't *need* to create DOM elements. It may also perform other side effects, such as modifying other observable objects. For instance:

```javascript
// NOTE: See below for a better way.
const original = proxy(1);
const derived = proxy();
$(() => {
    derived.value = original.value * 42;
});

$('h3 text=', derived);
$('button text=Increment click=', () => original.value++);
```

The {@link aberdeen.derive} function makes the above a little easier. It works just like passing a function to {@link aberdeen.$}, creating an observer, the only difference being that the value returned by the function is reactively assigned to the `value` property of the observable object returned by `derive`. So the above could also be written as:

```javascript
const original = proxy(1);
const derived = derive(() => original.value * 42);

$('h3 text=', derived);
$('button text=Increment click=', () => original.value++);
```

For deriving values from (possibly large) arrays or objects, Aberdeen provides specialized functions that enable fast, incremental updates to derived data: {@link aberdeen.map} (each item becomes zero or one derived item), {@link aberdeen.multiMap} (each item becomes any number of derived items), {@link aberdeen.count} (reactively counts the number of object properties), {@link aberdeen.isEmpty} (true when the object/array has no items) and {@link aberdeen.partition} (sorts each item into one or more buckets). An example:

```javascript
import * as aberdeen from 'aberdeen';
const {$, proxy} = aberdeen;

// Create some random data
const people = proxy({});
const randomInt = (max) => parseInt(Math.random() * max);
setInterval(() => {
    people[randomInt(250)] = {height: 150+randomInt(60), weight: 45+randomInt(90)};
}, 250);

// Do some mapping, counting and observing
const totalCount = aberdeen.count(people);
const bmis = aberdeen.map(people,
    person => Math.round(person.weight / ((person.height/100) ** 2))
);
const overweightBmis = aberdeen.map(bmis, // Use map() as a filter
    bmi => bmi > 25 ? bmi : undefined
); 
const overweightCount = aberdeen.count(overweightBmis);
const message = aberdeen.derive(
    () => `There are ${totalCount.value} people, of which ${overweightCount.value} are overweight.`
);

// Show the results
$('p text=', message);
$(() => {
    // isEmpty only causes a re-run when the count changes between zero and non-zero
    if (aberdeen.isEmpty(overweightBmis)) return;
    $('p#These are their BMIs:', () => {
        aberdeen.onEach(overweightBmis, bmi => $('# '+bmi), bmi => -bmi);
        // Sort by descending BMI
    });
})
```

## Debugging with dump()

The {@link aberdeen.dump} function creates a live, interactive tree view of any data structure in the DOM. It's particularly useful for debugging reactive state:

```javascript
import { $, proxy, dump } from 'aberdeen';

const state = proxy({
    user: { name: 'Frank', kids: 1 },
    items: ['a', 'b']
});

$('h2#Live State Dump');
dump(state);

// The dump updates automatically as state changes
$('button text="Update state" click=', () => {
    state.user.kids++;
    state.items.push('new');
});
```

The dump renders recursively using `<ul>` and `<li>` elements, showing all properties and their values. It updates reactively when any proxied data changes. It is intended for debugging, though with some CSS styling you may find it useful in some simple real-world scenarios as well.


## html-to-aberdeen

Sometimes, you want to just paste a largish block of HTML into your application (and then maybe modify it to bind some actual data). Having to translate HTML to `$` calls manually is little fun, so there's a tool for that:

```sh
npx html-to-aberdeen
```

It takes HTML on stdin (paste it and press `ctrl-d` for end-of-file), and outputs JavaScript on stdout.

> Caveat: This tool has been vibe coded (thanks Claude!) with very little code review. As it doesn't use the filesystem nor the network, I'd say it's safe to use though! :-) Also, it happens to work pretty well.

## Routing

Aberdeen provides an optional built-in router via the {@link route} module. The router is reactive and integrates seamlessly with browser history.

The {@link route.current} object is an observable that reflects the current URL:

```javascript
import { $ } from 'aberdeen';
import * as route from 'aberdeen/route';

$(() => {
    $(`p#Path string: ${route.current.path}`); // eg "/example/123"
    $(`p#Path segments: ${JSON.stringify(route.current.p)}`); // eg ["example", "123"]
});
```

To navigate programmatically, use {@link route.go}:

```javascript
import { $ } from 'aberdeen';
import * as route from 'aberdeen/route';
console.log('pn', location.protocol, location.host, location.hostname, location.pathname);

$('button#Go to settings', {
    click: () => route.go('/settings')
});

// Or using path segments
$('button ml:1rem #Go to user 123', {
    click: () => route.go({p: ['users', 123]})
});
```

For convenience, you can call {@link route.interceptLinks} once to automatically convert clicks on local `<a>` tags into Aberdeen routing, so you can use regular anchor tags without manual click handlers. Example: `$('a href=/settings text=Settings')`.

```javascript
import { $ } from 'aberdeen';
import * as route from 'aberdeen/route';

route.interceptLinks(); // Just once on startup:

$('a role=button href=/settings #Go to settings')
```

The {@link route.push} function is useful for overlays that should be closeable with browser back:

```javascript
import { $ } from 'aberdeen';
import * as route from 'aberdeen/route';

$('button#Open modal', {
    click: () => route.push({state: {modal: 'settings'}})
});

$(() => {
    if (!route.current.state.modal) return;
    $('div.modal-overlay', {
        click: () => route.back({state: {modal: undefined}})
    }, () => {
        $('div.modal#Modal content here');
    });
});
```

Optionally, you can use the {@link dispatcher.Dispatcher} class for declarative routing. It allows you to register route patterns with associated handler functions, which are invoked when the current route matches the pattern. It can match typed parameters and rest parameters.

## Prediction

When building interactive applications with client-server communication, Aberdeen's prediction system allows for optimistic UI updates. The {@link prediction.applyPrediction} function records changes to any proxied objects made within its callback. These changes are treated as *predictions* that may later be confirmed or reverted based on server responses. When a server response arrives, the {@link prediction.applyCanon} function applies authoritative changes from the server, reverting any conflicting predictions while attempting to reapply non-conflicting ones.

## Full Example: Multi-page App

Here's a complete example (a contact manager) demonstrating routing, state management, CSS, dark mode, and dynamic content:

```typescript
import { $, proxy, onEach, cssVars, ref, darkMode, insertCss, insertGlobalCss, setSpacingCssVars, map } from 'aberdeen';
import * as route from 'aberdeen/route';
import { Dispatcher } from 'aberdeen/dispatcher';
import { grow, shrink } from 'aberdeen/transitions';

class Contact {
    constructor(
        public id: number,
        public firstName: string,
        public lastName: string,
        public email: string,
        public phone: string
    ) {}
}

// Enable link interception for SPA navigation
route.interceptLinks();

// Initialize $1-$12 CSS variables for consistent spacing ($2=0.5rem, $3=1rem, $4=2rem, etc.)
setSpacingCssVars();

// Reactive theme based on system preference
$(() => {
    cssVars.primary = '#2563eb';
    cssVars.bg = darkMode() ? '#0f172a' : '#ffffff';
    cssVars.fg = darkMode() ? '#e2e8f0' : '#1e293b';
    cssVars.cardBg = darkMode() ? '#1e293b' : '#f8fafc';
    cssVars.border = darkMode() ? '#334155' : '#e2e8f0';
});

// Global styles for semantic HTML elements that apply everywhere
insertGlobalCss({
    "*": "m:0 p:0",
    "body": "bg:$bg fg:$fg font-family: system-ui, sans-serif;",
    "a": "color:$primary text-decoration:none",
    "a:hover": "text-decoration:underline",
    "a[role=button]": "bg:$primary fg:white r:8px p:$2",
});

// Application state
const contacts = proxy([
    new Contact(1, 'Emma', 'Wilson', 'emma.wilson@email.com', '555-0101'),
    new Contact(2, 'James', 'Anderson', 'j.anderson@email.com', '555-0102'),
    new Contact(3, 'Sofia', 'Martinez', 'sofia.m@email.com', '555-0103'),
    new Contact(4, 'Liam', 'Brown', 'liam.brown@email.com', '555-0104')
]);

// Router setup
const dispatcher = new Dispatcher();
dispatcher.addRoute(drawHome);
dispatcher.addRoute('contacts', drawContactList);
dispatcher.addRoute('contacts', Number, drawContactDetail);

// Main app
$('div.app', () => {
    $('nav display:flex gap:$3 p:$3 border-bottom: 1px solid $border;', () => {
        $('a href=/ text=Home font-weight:', route.current.p.length === 0 ? 'bold' : 'normal');
        $('a href=/contacts text=Contacts font-weight:', route.current.p[0] === 'contacts' ? 'bold' : 'normal');
    });
    $('main p:$3', () => dispatcher.dispatch(route.current.p));
});

function drawHome() {
    $('h1#Contact Manager');
    $('p#A modern contact list with search, sort, and dark mode support.');
}

// Contact card styles
const cardStyle = insertCss({
    "&": "bg:$cardBg border: 1px solid $border; r:8px p:$3 mv:$2 display:block transition: transform 0.2s;",
    "&:hover": "transform:translateX(4px)",
    "a&": "color:inherit;",
});

const filterStyle = insertCss({
    "&": "display:flex gap:$3 mv:$3",
    "> *": "p:$2 r:4px bg:$bg fg:$fg border: 1px solid $border;",
});

function drawContactList() {
    $('h1#Contacts');
    
    // Search and sort controls
    $('div', filterStyle, () => {
        $('input flex:1 placeholder="Search contacts..." bind=', ref(route.current.search, 'q'));
        $('select bind=', ref(route.current.search, 'sort'), () => {
            $('option value=firstName #First Name');
            $('option value=lastName #Last Name');
            $('option value=email #Email');
        });
    });
    
    // Contact list
    $('div', () => {
        const sortBy = route.current.search.sort || 'firstName';

        const filtered = map(contacts, contact => {
            const query = route.current.search.q;
            if (query) {
                const info = `${contact.firstName} ${contact.lastName} ${contact.email}`;
                if (!info.toLowerCase().includes(query.toLowerCase())) return; // Skip!
            }
            return contact;
        });
        
        onEach(filtered, contact => {
            $('a', cardStyle, 'create=', grow, 'destroy=', shrink, `href=/contacts/${contact.id}`, () => {
                $('h2', () => {
                    $('span font-weight:normal text=', contact.firstName+" ");
                    $('span text=', contact.lastName);
                });
                $('div text=', contact.email);
            });
        }, contact => contact[sortBy].toLowerCase());

        $(`a role=button mt:$3 text="Add new contact" href=/contacts/${contacts.length}`);
    });
}

// Detail form styles
const detailStyle = insertCss({
    "&": "bg:$cardBg border: 1px solid $border; r:8px p:$4 max-width:600px",
    "label": "display:block font-weight:600 mt:$3 mb:$2",
    "input": "w:100% p:$2 r:4px border: 1px solid $border; bg:$bg fg:$fg"
});

function drawContactDetail(id: number) {
    const contact = contacts[id] ||= {};
    
    $('a role=button href=/contacts #← Back');
    
    $('div mt:$3', detailStyle, () => {
        $('h2 mb:$2 text=', ref(contact, 'firstName'), 'text=', ' ', 'text=', ref(contact, 'lastName'));
        $('label text="First Name" input bind=', ref(contact, 'firstName'));
        $('label text="Last Name" input bind=', ref(contact, 'lastName'));
        $('label text="Email" input type=email bind=', ref(contact, 'email'));     
        $('label text="Phone" input type=tel bind=', ref(contact, 'phone'));
    });
}
```

## Further reading

If you've understood all/most of the above, you should be ready to get going with Aberdeen! You may also find these links helpful:

- [Reference documentation](https://aberdeenjs.org/modules.html)
- [Examples](https://aberdeenjs.org/#examples)
