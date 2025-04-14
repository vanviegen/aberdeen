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

The `$` function accepts various forms of arguments, which can be combined.

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

Also, we can create multiple nested DOM elements in a single `$` invocation, *if* the parents need to have only a single child. For instance:

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

Of course, putting everything in a single `$` call will get messy soon, and you'll often want to nest more than one child within a parent. To do that, you can pass in a *content* function to `$`, like this:

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
Aberdeen's reactivity system is built around observable objects. These are created using the `proxy` function:

When you access properties of a proxied object within an observer function (the function passed to `$`), Aberdeen automatically tracks these dependencies. If the values change later, the observer function will re-run, updating only the affected parts of the DOM.

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

You can create observable arrays too:

```javascript
const items = proxy([1, 2, 3]);

$('ul', () => {
    for (const item of items) {
        $('li', `:Item ${item}`);
    }
});

$('button:Add', {click: () => items.push(items.length+1)});  // The list will update with a new li element
```

### Two-way binding
Aberdeen makes it easy to create two-way bindings between form elements and your data:

```javascript
import { $, proxy, ref } from 'aberdeen';

const user = proxy({
    name: 'Alice',
    active: false
});

// Text input binding
$('input', { 
    placeholder: 'Name',
    bind: ref(user, 'name')  // Creates two-way binding
});

// Checkbox binding
$('label', () => {
    $('input', { 
        type: 'checkbox', 
        bind: ref(user, 'active')
    });
    $(':Active');
});

// Display the current state
$('div.box', () => {
    $(`p:Name: ${user.name}`);
    $(`p:Status: ${user.active ? 'Active' : 'Inactive'}`);
});
```

The `ref` function creates a reference to a specific property of an object, allowing Aberdeen to both read from and write to that property.

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

### Efficient list rendering with onEach
For rendering lists efficiently, Aberdeen provides the `onEach` helper:

```javascript
import { $, proxy, onEach } from 'aberdeen';

const todos = proxy([
    { id: 1, text: 'Learn Aberdeen', completed: false },
    { id: 2, text: 'Build an app', completed: false }
]);

$('ul', () => {
    onEach(todos, (todo, index) => {
        $('li', {
            class: { completed: todo.completed }
        }, () => {
            $('input', { 
                type: 'checkbox',
                checked: todo.completed,
                change: () => todo.completed = !todo.completed
            });
            $(`span:${todo.text}`);
            $('button:Delete', {
                click: () => todos.splice(index, 1)
            });
        });
    }, todo => todo.id);  // Optional key function for stable identity
});
```

The `onEach` function takes three arguments:
1. The array to iterate over
2. A render function that receives the item and its index
3. An optional key function to help Aberdeen track items when they move

### CSS and styling
Aberdeen provides ways to add CSS to your components:

```javascript
import { $, insertCss } from 'aberdeen';

// Create a CSS class that can be applied to elements
const buttonStyle = insertCss({
    backgroundColor: 'blue',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '4px',
    '&:hover': {
        backgroundColor: 'darkblue'
    }
});

$('button:Click me', buttonStyle);

// You can also apply styles conditionally
const theme = proxy({ dark: false });

const darkStyle = insertCss({
    backgroundColor: '#222',
    color: '#eee'
});

$('div', { [darkStyle]: theme.dark }, () => {
    $('h1:Dynamic Styling');
    $('p:This content changes style based on the theme.');
    $('button:Toggle Theme', {
        click: () => theme.dark = !theme.dark
    });
});
```

### Transitions and animations
Aberdeen provides transition helpers for smooth element entry and exit:

```javascript
import { $, proxy } from 'aberdeen';
import { grow, shrink } from 'aberdeen/transitions';

const showDetails = proxy(false);

$('div', () => {
    $('button:Toggle Details', {
        click: () => showDetails.value = !showDetails.value
    });
    
    if (showDetails.value) {
        $('div.details', {
            create: grow,   // Animation when element is created
            destroy: shrink // Animation when element is removed
        }, () => {
            $('p:These are the details you requested.');
        });
    }
});
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
}, [user, 'name']);  // Optional dependency array to limit when this runs
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
