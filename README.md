# [Aberdeen](https://aberdeenjs.org/) [![](https://img.shields.io/badge/license-ISC-blue.svg)](https://github.com/vanviegen/aberdeen/blob/master/LICENSE.txt) [![](https://badge.fury.io/js/aberdeen.svg)](https://badge.fury.io/js/aberdeen) ![](https://img.shields.io/bundlejs/size/aberdeen) [![](https://img.shields.io/github/last-commit/vanviegen/aberdeen)](https://github.com/vanviegen/aberdeen)

Build blazing-fast, declarative UIs in pure TypeScript/JavaScript – no virtual DOM.

Aberdeen offers a refreshingly simple approach to reactive UIs. Its core idea:

> Use many small, anonymous functions for emitting DOM elements, and automatically rerun them when their underlying *proxied* data changes. This proxied data can be anything from simple values to complex, typed, and deeply nested data structures.

Now, let's dive into why this matters...

## Why use Aberdeen?

- 🎩 **Elegant and simple:** Express UIs naturally in JavaScript/TypeScript, without complex abstractions, build steps, or JSX. No hooks, no `setState`, no lifting state, no state management libraries. Just proxied data and automatically rerunning functions.
- ⏩ **Fast:** No virtual DOM. Aberdeen intelligently updates only the minimal, necessary parts of your UI when proxied data changes.
- 👥 **Awesome lists**: It's very easy and performant to reactively display data sorted by whatever you like.
- 🔬 **Tiny:** Around 5KB (minimized and gzipped) and with zero runtime dependencies.
- 🔋 **Batteries included**: Comes with client-side routing, revertible patches for optimistic user-interface updates, component-local CSS, helper functions for transforming reactive data (mapping, partitioning, filtering, etc) and hide/unhide transition effects. No bikeshedding required!

## Why *not* use Aberdeen?

- 🤷 **Lack of community:** There are not many of us -Aberdeen developers- yet, so don't expect terribly helpful Stack Overflow/AI answers.
- 📚 **Lack of ecosystem:** You'd have to code things yourself, instead of duct-taping together a gazillion React ecosystem libraries.

## Examples

To get a quick impression of what Aberdeen code looks like, below is a Tic-tac-toe app with undo history. If you're reading this on [the official website](https://aberdeenjs.org) you should see a working demo below the code, and an 'edit' button in the top-right corner of the code, to play around.

```javascript
import {$, proxy, onEach, insertCss, observe} from "aberdeen";

// Helper functions

function calculateWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // horizontal
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // vertical
        [0, 4, 8], [2, 4, 6] // diagonal
    ];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
}

function getCurrentMarker(board) {
    return board.filter(v => v).length % 2 ? "O" : "X";
}

function getBoard(history) {
    return history.boards[history.current];
}

function markSquare(history, position) {
    const board = getBoard(history);

    // Don't allow markers when we already have a winner
    if (calculateWinner(board)) return;

    // Copy the current board, and insert the marker into it
    const newBoard = board.slice();
    newBoard[position] = getCurrentMarker(board);
    
    // Truncate any future states, and write a new future
    history.current++;
    history.boards.length = history.current;
    history.boards.push(newBoard);
}

// Define component-local CSS, which we'll utilize in the drawBoard function.
// Of course, you can use any other styling solution instead, if you prefer.

const boardStyle = insertCss({
    display: 'grid',
    gap: '0.5em',
    gridTemplateColumns: '1fr 1fr 1fr',
    '> *': {
        width: '2em',
        height: '2em',
        padding: 0,
    },
});

// UI drawing functions.

function drawBoard(history) {
    $('div', boardStyle, () => {
        for(let pos=0; pos<9; pos++) {
            $('button.square', () => {
                let marker = getBoard(history)[pos];
                if (marker) {
                    $({ text: marker });
                } else {
                    $({ click: () => markSquare(history, pos) });
                }
            });
        }
    })
}

function drawStatusMessage(history) {
    $('h4', () => {
        // Reruns whenever observable data read by calculateWinner or getCurrentMarker changes
        const board = getBoard(history);
        const winner = calculateWinner(board);
        if (winner) {
            $(`:Winner: ${winner}!`);
        } else if (board.filter(square=>square).length === 9) {
            $(`:It's a draw...`);
        } else {
            $(`:Current player: ${getCurrentMarker(board)}`);
        }
    });
}

function drawTurns(history) {
    $('div:Select a turn:')
    // Reactively iterate all (historic) board versions
    onEach(history.boards, (_, index) => {
        $('button', {
            // A text node:
            text: index,
            // Conditional css class:
            ".outline": observe(() => history.current != index),
            // Inline styles:
            $marginRight: "0.5em",
            $marginTop: "0.5em",
            // Event listener:
            click: () => history.current = index,
        });
    });
}

function drawMain() {
    // Define our state, wrapped by an observable proxy
    const history = proxy({
        boards: [[]], // eg. [[], [undefined, 'O', undefined, 'X'], ...]
        current: 0, // indicates which of the boards is currently showing
    });

    $('main.row', () => {
        $('div.box', () => drawBoard(history));
        $('div.box', {$flex: 1}, () => {
            drawStatusMessage(history);
            drawTurns(history);
        });
    });
}

// Fire it up! Mounts on document.body by default..

drawMain();
```

Some further examples:

- [Input example demo](https://aberdeenjs.org/examples/input/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/input)
- [List example demo](https://aberdeenjs.org/examples/list/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/list)
- [Routing example demo](https://aberdeenjs.org/examples/router/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/router)
- [JS Framework Benchmark demo](https://aberdeenjs.org/examples/js-framework-benchmark/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/js-framework-benchmark)

## Learning Aberdeen

- [Tutorial](https://aberdeenjs.org/Tutorial/)
- [Reference documentation](https://aberdeenjs.org/modules.html)

And you may want to study the examples above, of course!

## News

- **2025-05-07**: After five years of working on this library on and off, I'm finally happy with its API and the developer experience it offers. I'm calling it 1.0! To celebrate, I've created some pretty fancy (if I may say so myself) interactive documentation and a tutorial.
