A TypeScript/JavaScript library for quickly building performant declarative user interfaces *without* the use of a virtual DOM.

The key insight is the use of many small anonymous functions, that will automatically rerun when the underlying data changes. In order to trigger updates, that data should be encapsulated in any number of *proxied* JavaScript objects. They can hold anything, from simple values to complex and deeply nested data structures, in which case user-interface functions can (automatically) subscribe to just the parts they depend upon.

## Why use Aberdeen?

- It provides a flexible and simple to understand model for reactive user-interface building.
- It allows you to express user-interfaces in plain JavaScript (or TypeScript) in an easy to read form, without (JSX-like) compilation steps.
- It's fast, as it doesn't use a *virtual DOM* and only reruns small pieces of code, redrawing small pieces of the UI, in response to updated data. It also makes displaying and updating sorted lists very easy and very fast.
- It's lightweight, at about 5kb (minimized and gzipped) and without any run-time dependencies.
- It comes with batteries included, providing modules for..
  - Client-side routing.
  - Revertible patches, for optimistic user-interface updates.
  - A couple of add/remove transition effects.

## Examples

- [Tic-tac-toe demo](https://vanviegen.github.io/aberdeen/examples/tic-tac-toe/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/tic-tac-toe)
- [Input example demo](https://vanviegen.github.io/aberdeen/examples/input/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/input)
- [List example demo](https://vanviegen.github.io/aberdeen/examples/list/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/list)
- [Routing example demo](https://vanviegen.github.io/aberdeen/examples/router/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/router)
- [JS Framework Benchmark demo](https://vanviegen.github.io/aberdeen/examples/js-framework-benchmark/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/js-framework-benchmark)

To get a quick impression of what Aberdeen code looks like, this is all of the JavaScript for the above Tic-tac-toe demo:

```javascript
import {$, proxy, onEach, copy} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';

// Observable data using proxy instead of Store
const squares = proxy([]);  // eg. ['X', undefined, 'O', 'X']
const history = proxy([[]]);  // eg. [[], [undefined, 'O', undefined, 'X'], ...]
const historyPos = proxy(null);  // set while 'time traveling' our undo history

// Helper function to calculate derived values
function calculateWinner(squares) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // horizontal
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // vertical
        [0, 4, 8], [2, 4, 6] // diagonal
    ];
    for (const [a, b, c] of lines) {
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return squares[a];
        }
    }
}

// Rendering functions
function drawSquare(position) {
    $('button.square', () => {
        let value = squares[position];
        if (value) {
            $({ text: value });
        } else {
            $({ click: () => fillSquare(position) });
        }
    });
}

function drawBoard() {
    for (let y = 0; y < 3; y++) {
        $('div.board-row', () => {
            for (let x = 0; x < 3; x++) {
                drawSquare(y * 3 + x);
            }
        });
    }
}

function getCurrentPlayer() {
	return squares.filter(v => v).length % 2 ? "O" : "X";
}

function drawInfo() {
    // Calculate derived values inside the reactive scope
    $('div', () => {
        const winner = calculateWinner(squares);        
        if (winner) {
            $(`:Winner: ${winner}!`);
        } else {
            $(`:Current player: ${getCurrentPlayer()}`);
        }
    });
    
    $('div.buttons', () => {
        // Use onEach with the new API
        onEach(history, (item, index) => {
            $('button', {
                text: index ? `Go to move ${index}` : `Go to game start`,
                click: () => {
                    historyPos.value = index;
                    // Copy the history item to squares
                    copy(squares, item);
                }
            });
        });
    });
}

// Helper functions
function fillSquare(position) {
    // If there's already a winner, don't allow a new square to be filled
    if (calculateWinner(squares)) return;
    
    // Fill the square
    squares[position] = getCurrentPlayer();
    
    if (historyPos.value != null) {
        // Truncate everything after history pos
        history.splice(historyPos.value + 1);
        // Stop 'time traveling'
        historyPos.value = null;
    }
    
    // Append the current squares-state to the history array
    // We need to create a new array since we can't directly push the squares reference
    history.push([...squares]);
}

// Fire it up! Mounts on document.body by default..
$('div.game', () => {
	$('div.game-board', drawBoard);
	$('div.game-info', drawInfo);
});
```

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
$('button.danger.large:Delete');
```

Multiple strings can be passed, so the above could just as well be written as:

```javascript
$('button', '.danger', '.large', ':Delete');
```

Also, we can create multiple nested DOM elements in a single `$` invocation, *if* the parents need to have only a single child. For instance:

```javascript
$('div.input-container', 'input.optional');
```

Which would translate to `<div class="input-container"><input class="optional"></div>`.

In order to pass in additional properties and attributes to the 'current' DOM element, we can pass in an object. So to extend the above example:

```javascript
$('div.input-container', {id: 'cityContainer'}, 'input.optional', {value: 'London', placeholder: 'City'});
```

Which would translate to
```html
<div class="input-container" id="cityContainer">
	<input class="optional" value="London" placeholder="City">
</div>
```

When a function is passed as a property value, it's used as an event listener. So to always log the current input value to the console you can do:

```javascript
$('div.input-container', 'input.optional', {input: function(){console.log(this.value)} });
```

Of course, putting everything in a single `$` call will get messy soon, and you'll often want to nest more than one child within a parent. To do that, you can pass in a *content* function as the last argument to `$`, like this:

```javascript
$('div.input-container', {id: 'cityContainer'}, () => {
	$('input.optional', {value: 'London', placeholder: 'City'});
	$('button', {click: () => alert("You got it!")});
});
```

Why are we passing in a function, instead of just, say, an array of children? I'm glad you asked! :-) For each such function Aberdeen will create an *observer*, which will play a major part in what comes next...

### Observable objects
Aberdeen's reactivity system is built around observable objects. These are created using the `proxy` function:

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
```

When you access properties of a proxied object within an observer function (the function passed to `$`), Aberdeen automatically tracks these dependencies. If the values change later, the observer function will re-run, updating only the affected parts of the DOM.

```javascript
// Later in your code:
user.name = 'Bob';
// Or
user.age++;
```

As the content function of our `div` is subscribed to both `user.name` and `user.age`, modifying either of these would trigger a re-run of that function, first undoing any side-effects (most notably: inserting DOM elements) of the earlier run. If, however `user.city` is changed, no re-run would be triggered as the function is not subscribed to that property.

So if either property changes, both the `<h1>` and `<p>` are recreated as the inner most observer function tracking the changes is re-run. If you want to redraw on an even granular level, you can of course:

```javascript
$('div', () => {
    $(`h1`, () => {
		$(`:Hello, ${user.name}!`);
	});
    $(`p`, () => {
		$(`:You are ${user.age} years old.`);
	});
});
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

// Later:
items.push(4);  // The list will update with a new li element
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
$('div', () => {
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

This tutorial covers the core concepts of Aberdeen, demonstrating how its reactive system makes it easy to build dynamic, responsive web applications with minimal code.


## How it works

The `proxy` functions wraps JavaScript `Proxy` objects around your (nested) data objects. The resulting objects (which can also be arrays or instances of classes) act exactly like their normal counterparts, but in addition:
- When reading a property from an *observe scope* (see below), the scope is associated with the property.
- When updating a property, any associated scopes are asked to rerun, by first cleaning up side-effects (such as DOM element creation) and then running the scope function again.

Observe scopes can be manually created, using `$(myFunction)`, which would cause `myFunction()` to be executed immediately and again if any of the proxied properties it reads is changed.


## Reference documentation

https://vanviegen.github.io/aberdeen/modules.html


## Roadmap

- [x] Support for (dis)appear transitions.
- [x] A better alternative for scheduleTask.
- [x] A simple router.
- [x] Optimistic client-side predictions.
- [x] Performance profiling and tuning regarding lists.
- [x] Support for (component local) CSS
- [ ] More user friendly documentation generator.
- [ ] Architecture document.
- [ ] SVG support.
