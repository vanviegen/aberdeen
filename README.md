# [Aberdeen](https://aberdeenjs.org/) [![](https://img.shields.io/badge/license-ISC-blue.svg)](https://github.com/vanviegen/aberdeen/blob/master/LICENSE.txt) [![](https://badge.fury.io/js/aberdeen.svg)](https://badge.fury.io/js/aberdeen) ![](https://img.shields.io/bundlejs/size/aberdeen) [![](https://img.shields.io/github/last-commit/vanviegen/aberdeen)](https://github.com/vanviegen/aberdeen)

Reactive UIs in plain TypeScript. Simple to learn, fast to ship.

Aberdeen wraps your state in ES6 `Proxy` objects for fine-grained property access tracking, then automatically re-executes only the DOM-building closures that depend on changed data. So we get precise DOM updates with neither virtual DOM diffing nor compiler magic.

## Why use Aberdeen?

- **Simple:** Express UIs naturally in JavaScript/TypeScript, without requiring build steps or JSX, and with a minimal amount of concepts you need to learn.
- **Type-safe:** Your reactive state can be regular TypeScript objects and arrays, with full type safety and autocompletion.
- **Fast:** No virtual DOM. Aberdeen intelligently updates only the minimal, necessary parts of your UI when proxied data changes.
- **Awesome lists**: It's very easy and performant to reactively display data sorted by whatever you like.
- **Tiny:** Around 7KB (minimized and gzipped) for the core system. Zero runtime dependencies.
- **Batteries included**: Comes with...
  - Browser history management
  - Routing
  - Revertible patches for optimistic user-interface updates
  - Component-local CSS with Tailwind-like shorthands
  - SVG support
  - Helper functions for transforming reactive data (mapping, partitioning, filtering, etc)
  - Hide/unhide transition effects

## Why *not* use Aberdeen?

- **Lack of community:** There are not many of us -Aberdeen developers- yet, so don't expect terribly helpful Stack Overflow/AI answers.
- **Lack of ecosystem:** You'd have to code things yourself, instead of duct-taping together a gazillion React ecosystem libraries.

## Examples

First, let's start with the obligatory reactive counter example. If you're reading this on [the official website](https://aberdeenjs.org) you should see a working demo below the code, and an 'edit' button in the top-right corner of the code, to play around.

```javascript
import {$, proxy, ref} from 'aberdeen';

// Define some state as a proxied (observable) object
const state = proxy({question: "How many roads must a man walk down?", answer: 42});

$('h3', () => {
    // This function reruns whenever the question or the answer changes
    $('text=', `${state.question} ↪ ${state.answer || 'Blowing in the wind'}`)
});

// Two-way bind state.question to an <input>
$('input placeholder=Question bind=', ref(state, 'question'))

// Allow state.answer to be modified using both an <input> and buttons
$('div.row margin-top:1em', () => {
    $('button text=- click=', () => state.answer--);
    $('input type=number bind=', ref(state, 'answer'))
    $('button text=+ click=', () => state.answer++);
});
```

Okay, next up is a somewhat more complex app - a todo-list with the following behavior:

- New items open in an 'editing state'.
- Items that are in 'editing state' show a text input, a save button and a cancel button. Done status cannot be toggled while editing.
- Pressing one of the buttons, or pressing enter will transition from 'editing state' to 'viewing state', saving the new label text unless cancel was pressed.
- In 'viewing state', the label is shown as non-editable. There's an 'Edit' link, that will transition the item to 'editing state'. Clicking anywhere else will toggle the done status.
- The list of items is sorted alphabetically by label. Items move when 'save' changes their label.
- Items that are created, moved or deleted grow and shrink as appropriate.

Pfew.. now let's look at the code:

```typescript
import {$, proxy, onEach, insertCss, peek, unproxy, ref} from "aberdeen";
import {grow, shrink} from "aberdeen/transitions";

// We'll use a simple class to store our data.
class TodoItem {
    constructor(public label: string = '', public done: boolean = false) {}
    toggle() { this.done = !this.done; }
}

// The top-level user interface.
function drawMain() {
    // Add some initial items. We'll wrap a proxy() around it!
    let items: TodoItem[] = proxy([
        new TodoItem('Make todo-list demo', true),
        new TodoItem('Learn Aberdeen', false),
    ]);
    
    // Draw the list, ordered by label.
    onEach(items, drawItem, item => item.label);

    // Add item and delete checked buttons.
    $('div.row', () => {
        $('button text=+ click=', () => items.push(new TodoItem("")));
        $('button.outline text="Delete checked" click=', () => {
            for(let idx in items) {
                if (items[idx].done) delete items[idx];
            }
        });
    });
};

// Called for each todo list item.
function drawItem(item) {
    // Items without a label open in editing state.
    // Note that we're creating this proxy outside the `div.row` scope
    // create below, so that it will persist when that state reruns.
    let editing: {value: boolean} = proxy(item.label == '');

    $('div.row', todoItemStyle, 'create=', grow, 'destroy=', shrink, () => {
        // Conditionally add a class to `div.row`, based on item.done
        $({".done": ref(item,'done')});

        // The checkmark is hidden using CSS
        $('div.checkmark text=✅');

        if (editing.value) {
            // Proxied string to hold label while being edited.
            const labelCopy = proxy(item.label);
            function save() {
                editing.value = false;
                item.label = labelCopy.value;
            }
            // Label <input>. Save using enter or button.
            $('input placeholder=Label bind=', labelCopy, 'keydown=', e => e.key==='Enter' && save());
            $('button.outline text=Cancel click=', () => editing.value = false);
            $('button text=Save click=', save);
        } else {
            // Label as text. 
            $('p text=', item.label);

            // Edit icon, if not done.
            if (!item.done) {
                $('a text=Edit click=', e => {
                    editing.value = true;
                    e.stopPropagation(); // We don't want to toggle as well.
                });
            }
            
            // Clicking a row toggles done.
            $('cursor:pointer click=', () => item.done = !item.done);
        }
    });
}

// Insert some component-local CSS, specific for this demo.
const todoItemStyle = insertCss({
    "&": "mb:0.5rem",
    ".checkmark": "opacity:0.2",
    "&.done": "text-decoration:line-through",
    "&.done .checkmark": "opacity:1"
});

// Go!
drawMain();
```

Some further examples:

- [Input demo](https://aberdeenjs.org/examples/input/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/input)
- [Tic Tac Toe demo](https://aberdeenjs.org/examples/tictactoe/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/tictactoe)
- [List demo](https://aberdeenjs.org/examples/list/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/list)
- [Routing demo](https://aberdeenjs.org/examples/route/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/route)
- [JS Framework Benchmark demo](https://aberdeenjs.org/examples/js-framework-benchmark/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/js-framework-benchmark)


## Learning Aberdeen

- [Tutorial](https://aberdeenjs.org/Tutorial/)
- [Reference documentation](https://aberdeenjs.org/modules.html)

And you may want to study the examples above, of course!


## AI Integration

If you use Claude Code, GitHub Copilot or another AI agents that supports Skills, Aberdeen includes a `skill/` directory that provides specialized knowledge to the AI about how to use the library effectively.

To use this, it is recommended to symlink the skill into your project's `.claude/skills` directory:

```bash
mkdir -p .claude/skills
ln -s ../../node_modules/aberdeen/skill .claude/skills/aberdeen
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full history of changes.
