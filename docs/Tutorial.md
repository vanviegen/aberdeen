---
title: Tutorial
---

## Tutorial

### Creating elements

This is a complete Aberdeen application:

```javascript
import {$} from 'aberdeen';
$('h1:Hello world');
```

It adds a `<h1>Hello world</h1>` element to the `<body>` (which is the default mount point).

The {@link aberdeen.$} function accepts various forms of arguments, which can be combined.

When a string is passed:
- The inital part (if any) is the name of the element to be created.
- One or multiple CSS classes can be added to the 'current' element, by prefixing them with a `.`.
- Content text can be added by prefixing it with a `:`.

```javascript
$('button.outline.secondary:Pressing me does nothing!');
```

Note that you can play around, modifying any example while seeing its live result by pressing the *Edit* button that appears when hoovering an example!

Multiple strings can be passed, so the above could just as well be written as:

```javascript
$('button', '.outline', '.secondary', ':Pressing me does nothing!');
```

Also, we can create multiple nested DOM elements in a single {@link aberdeen.$} invocation, *if* the parents need to have only a single child. For instance:

```javascript
$('div.box', ':Text within the div element...', 'input');
```

In order to pass in additional properties and attributes to the 'current' DOM element, we can pass in an object. So to extend the above example:

```javascript
$('div.box', {id: 'cityContainer'}, 'input', {value: 'London', placeholder: 'City'});
```

Note that `value` doesn't become an HTML attribute. This (together with `selectedIndex`) is one of two special cases, where Aberdeen applies it as a DOM property instead, in order to preserve the variable type (as attributes can only be strings).

When a function is passed as a property value, it's used as an event listener. So to always log the current input value to the console you can do:

```javascript
$('div.box', 'input', {
    value: 'Marshmallow', 
    input: el => console.log(el.target.value)
});
```

Note that the example is interactive - try typing something!

Of course, putting everything in a single {@link aberdeen.$} call will get messy soon, and you'll often want to nest more than one child within a parent. To do that, you can pass in a *content* function to {@link aberdeen.$}, like this:

```javascript
$('div.box.row', {id: 'cityContainer'}, () => {
    $('input', {
        value: 'London',
        placeholder: 'City'
    });
    $('button:Confirm', {
        click: () => alert("You got it!")
    });
});
```

Why are we passing in a function instead of just, say, an array of children? I'm glad you asked! :-) For each such function Aberdeen will create an *observer*, which will play a major part in what comes next...

### Observable objects
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
    $(`h1:Hello, ${user.name}!`);
    $(`p:You are ${user.age} years old.`);
});

setInterval(() => {
    user.name = 'Bob';
    user.age++;
}, 2000);
```

As the content function of our `div` is subscribed to both `user.name` and `user.age`, modifying either of these would trigger a re-run of that function, first undoing any side-effects (most notably: inserting DOM elements) of the earlier run. If, however `user.city` is changed, no re-run would be triggered as the function is not subscribed to that property.

So if either property changes, both the `<h1>` and `<p>` are recreated as the inner most observer function tracking the changes is re-run. If you want to redraw on an even granular level, you can of course:

```javascript
const user = proxy({
    name: 'Alice',
    age: 28,
});

$('div', () => {
    $(`h1`, () => {
        console.log('Name draws:', user.name)
        $(`:Hello, ${user.name}!`);
    });
    $(`p`, () => {
        console.log('Age draws:', user.age)
        $(`:You are ${user.age} years old.`);
    });
});

setInterval(() => {
    user.age++;
}, 2000);
```

Now, updating `user.name` would only cause the *Hello* text node to be replaced, leaving the `<div>`, `<h1>` and `<p>` elements as they were.

### Observable primitive values

Our {@link aberdeen.proxy} method uses wraps an object in a JavaScript [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy). As this doesn't work for primitive values (like numbers, strings and booleans), the method will wrap these types in an object in order to make it observable. The observable value is made available as its `.value` property.

```javascript
const count = proxy(42);
$('div.row', () => {
    // This scope will not have to redraw
    $('button:-', {click: () => count.value--});
    $('div', {text: count});
    $('button:+', {click: () => count.value++});
});
```

The reason that the scope within `div.row` doesn't have to redraw, is that we're passing in the observable object `count` as a whole to the `text:` property. When a property receives an observable object as its values, it will reactively read its `.value` property and handle changes.

If we would have done `$('div', {text: count.value});` instead, we *would* have subscribed to `count.value` within the `div.row` scope, meaning we'd be redrawing the two buttons and the div every time the count changes.

### Observable arrays

You can create observable arrays too. They work just like regular arrays, apart from being observable.

```javascript
const items = proxy([1, 2, 3]);

$('h1', () => {
    $(':First item: '+items[0]);
})

$('ul', () => {
    // This subscribes to the entire array, and thus redraws all <li>s when any item changes.
    // In the next section, we'll learn about a better way.
    for (const item of items) {
        $('li', `:Item ${item}`);
    }
});

$('button:Add', {click: () => items.push(items.length+1)});
```

### Efficient list rendering with onEach
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
    delete items[randomInt(10)];
    items[randomInt(10)] = {
        label: randomWord(),
        prio: randomInt(5)
    };
}, 500);

$('div.row.wide', {$height: '250px'}, () => {
    $('div.box:By index', () => {
        onEach(items, (item, index) => {
            $(`li:${item.label} (prio ${item.prio})`)
        });
    })
    $('div.box:By label', () => {
        onEach(items, (item, index) => {
            $(`li:${item.label} (prio ${item.prio})`)
        }, item => item.label);
    })
    $('div.box:By desc prio, then label', () => {
        onEach(items, (item, index) => {
            $(`li:${item.label} (prio ${item.prio})`)
        }, item => [-item.prio, item.label]);
    })
})
```

We can also use {@link aberdeen.onEach} to reactively iterate objects. In that case, the render and order functions receive `(value, key)` (instead of `(value, index)`) as their arguments.

```javascript
const pairs = proxy({A: 'Y', B: 'X',});

const randomWord = () => Math.random().toString(36).substring(2, 12).replace(/[0-9]+/g, '').replace(/^\w/, c => c.toUpperCase());

$('button:Add item', {click: () => pairs[randomWord()] = randomWord()});

$('div.row.wide', {$marginTop: '1em'}, () => {
    $('div.box:By key', () => {
        onEach(pairs, (value, key) => {
            $(`li:${key}: ${value}`)
        });
    })
    $('div.box:By desc value', () => {
        onEach(pairs, (value, key) => {
            $(`li:${key}: ${value}`)
        }, value => invertString(value));
    })
})
```

### Two-way binding
Aberdeen makes it easy to create two-way bindings between form elements (the various `<input>` types, `<textarea>` and `<select>`) and your data, by passing an observable object with a `.value` as `bind:` property to {@link aberdeen.$}.

In order to bind to properties other than `.value`, you can use the {@link aberdeen.ref} function to create a new proxy object with only a `.value` property that maps to a property with any name on any observable object.


```javascript
import { $, proxy, ref } from 'aberdeen';

const user = proxy({
    name: 'Alice',
    active: false
});

// Text input binding
$('input', { 
    placeholder: 'Name',
    bind: ref(user, 'name')
});

// Checkbox binding
$('label', () => {
    $('input', { 
        type: 'checkbox', 
        bind: ref(user, 'active')
    });
}, ':Active');

// Display the current state
$('div.box', () => {
    $(`p:Name: ${user.name} `, () => {
        // Binding works both ways
        $('button.outline.secondary:!', {
            click: () => user.name += '!'
        });
    });
    $(`p:Status: ${user.active ? 'Active' : 'Inactive'}`);
});
```

### Conditional rendering
You can conditionally render elements based on your data:

```javascript
const user = proxy({
    loggedIn: false
});

$('div', () => {
    if (user.loggedIn) {
        $('button:Logout', {
            click: () => user.loggedIn = false
        });
    } else {
        $('button:Login', {
            click: () => user.loggedIn = true
        });
    }
});
```

### CSS and styling
Through the {@link aberdeen.insertCss} function, Aberdeen provides a way to create component-local CSS.

```javascript
import { $, proxy, insertCss } from 'aberdeen';

// Create a CSS class that can be applied to elements
const myBoxStyle = insertCss({
    borderColor: '#6936cd',
    backgroundColor: '#1b0447',
    button: {
        backgroundColor: '#6936cd',
        border: 0,
        transition: 'box-shadow 0.3s',
        boxShadow: '0 0 4px #ff6a0044',
        '&:hover': {
            boxShadow: '0 0 16px #ff6a0088',
        }
    }
});

// myBoxStyle is now something like "AbdStl1". Let's apply it:
$('div.box', myBoxStyle, 'button:Click me');
```

### Transitions and animations
Aberdeen provides transition helpers for smooth element entry and exit:

```javascript
import { $, proxy, onEach } from 'aberdeen';
import { grow, shrink } from 'aberdeen/transitions';

const items = proxy([]);

const randomInt = (max) => parseInt(Math.random() * max);
const randomWord = () => Math.random().toString(36).substring(2, 12).replace(/[0-9]+/g, '').replace(/^\w/, c => c.toUpperCase());

// Make random mutations
setInterval(() => {
    delete items[randomInt(10)];
    items[randomInt(10)] = {
        label: randomWord(),
        prio: randomInt(5)
    };
}, 500);

$('div.row.wide', {$height: '250px'}, () => {
    $('div.box:By index', () => {
        onEach(items, (item, index) => {
            $(`li:${item.label} (prio ${item.prio})`, {create: grow, destroy: shrink})
        });
    })
    $('div.box:By label', () => {
        onEach(items, (item, index) => {
            $(`li:${item.label} (prio ${item.prio})`, {create: grow, destroy: shrink})
        }, item => item.label);
    })
    $('div.box:By desc prio, then label', () => {
        onEach(items, (item, index) => {
            $(`li:${item.label} (prio ${item.prio})`, {create: grow, destroy: shrink})
        }, item => [-item.prio, item.label]);
    })
})
```

### Computed values and side effects
While Aberdeen doesn't have explicit computed properties, you can create derived values within observer functions:

```javascript
const cart = proxy([
    { name: 'Item 1', price: 10, quantity: 2 },
    { name: 'Item 2', price: 15, quantity: 1 }
]);

$('div', () => {
    // Calculate total whenever cart changes
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    $('p', `:Total: $${total.toFixed(2)}`);
});
```

For side effects, you can use the `observe` function:

```javascript
import { observe } from 'aberdeen';

// Run this function whenever user.name changes
observe(() => {
    console.log(`Name changed to: ${user.name}`);
    // You could also save to localStorage, make API calls, etc.
});
```

### Putting it all together
Here's a more complete example combining these concepts:

```javascript
import { $, proxy, ref, onEach, observe } from 'aberdeen';
import { grow, shrink } from 'aberdeen/transitions';

// Create our state
const todos = proxy([]);
const newTodo = proxy({ text: '' });
const filter = proxy('all');  // 'all', 'active', or 'completed'

// Add a new todo
function addTodo() {
    if (newTodo.text.trim()) {
        todos.push({
            id: Date.now(),
            text: newTodo.text,
            completed: false
        });
        newTodo.text = '';
    }
}

// Save todos to localStorage whenever they change
observe(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
}, [todos]);

// Load saved todos on startup
try {
    const saved = JSON.parse(localStorage.getItem('todos'));
    if (Array.isArray(saved)) {
        todos.push(...saved);
    }
} catch (e) {
    console.error('Failed to load todos', e);
}

// Render our app
$('div.todo-app', () => {
    $('h1:Todo App');
    
    // Form to add new todos
    $('form', {
        submit: (e) => {
            e.preventDefault();
            addTodo();
        }
    }, () => {
        $('input', {
            placeholder: 'What needs to be done?',
            bind: ref(newTodo, 'text'),
            autofocus: true
        });
        $('button:Add', { type: 'submit' });
    });
    
    // Filter controls
    $('div.filters', () => {
        for (const option of ['all', 'active', 'completed']) {
            $('button', {
                class: { selected: filter.value === option },
                click: () => filter.value = option
            }, `:${option.charAt(0).toUpperCase() + option.slice(1)}`);
        }
    });
    
    // Todo list
    $('ul.todo-list', () => {
        // Filter todos based on selected filter
        const filteredTodos = todos.filter(todo => {
            if (filter.value === 'active') return !todo.completed;
            if (filter.value === 'completed') return todo.completed;
            return true;
        });
        
        if (filteredTodos.length === 0) {
            $('li.empty', `:No ${filter.value} todos`);
        } else {
            onEach(filteredTodos, (todo, index) => {
                $('li', {
                    class: { completed: todo.completed },
                    create: grow,
                    destroy: shrink
                }, () => {
                    $('input', {
                        type: 'checkbox',
                        checked: todo.completed,
                        change: () => todo.completed = !todo.completed
                    });
                    $('span', `:${todo.text}`);
                    $('button:×', {
                        click: () => {
                            const idx = todos.findIndex(t => t.id === todo.id);
                            if (idx >= 0) todos.splice(idx, 1);
                        }
                    });
                });
            }, todo => todo.id);
        }
    });
    
    // Footer with stats
    $('footer', () => {
        const remaining = todos.filter(t => !t.completed).length;
        $(`span:${remaining} item${remaining === 1 ? '' : 's'} left`);
        
        if (todos.some(t => t.completed)) {
            $('button:Clear completed', {
                click: () => {
                    for (let i = todos.length - 1; i >= 0; i--) {
                        if (todos[i].completed) todos.splice(i, 1);
                    }
                }
            });
        }
    });
});
```
