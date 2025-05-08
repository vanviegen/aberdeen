A TypeScript/JavaScript library for quickly building performant declarative user interfaces *without* the use of a virtual DOM.

The key insight is the use of many small anonymous functions, that will automatically rerun when the underlying data changes. In order to trigger updates, that data should be encapsulated in any number of *proxied* JavaScript objects. They can hold anything, from simple values to complex, typed and deeply nested data structures, in which case user-interface functions can (automatically) subscribe to just the parts they depend upon.

## Why use Aberdeen?

- It provides a flexible and simple to understand model for reactive user-interface building.
- It allows you to express user-interfaces in plain JavaScript (or TypeScript) in an easy to read form, without (JSX-like) compilation steps.
- It's fast, as it doesn't use a *virtual DOM* and only reruns small pieces of code, redrawing minimal pieces of the UI, in response to updated data. 
- It makes displaying and updating sorted lists very easy and very fast.
- It's tiny, at about 5kb (minimized and gzipped) and without any run-time dependencies.
- It comes with batteries included:
  - Client-side routing.
  - Revertible patches, for optimistic user-interface updates.
  - Component-local CSS generator.
  - Helper functions for reactively working with data, such as for deriving, (multi)mapping, filtering, partitioning and counting.
  - A couple of add/remove transition effects, to get you started.

## Why *not* use Aberdeen?

- There are not many of us -Aberdeen developers- yet, so don't expect terribly helpful StackOver/AI answers.
- You'd have to code things yourself, instead of duct-taping together a gazillion React ecosystem libraries.

## Example code

To get a quick impression of what Aberdeen code looks like, below is a Tic-tac-toe app with undo history. If you're reading this on [the official website](https://vanviegen.github.io/aberdeen/README/) you should see a working demo below the code, and an 'edit' button in the top-right corner of the code, to play around.

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

- [Input example demo](https://vanviegen.github.io/aberdeen/examples/input/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/input)
- [List example demo](https://vanviegen.github.io/aberdeen/examples/list/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/list)
- [Routing example demo](https://vanviegen.github.io/aberdeen/examples/router/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/router)
- [JS Framework Benchmark demo](https://vanviegen.github.io/aberdeen/examples/js-framework-benchmark/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/js-framework-benchmark)


## Documentation

- [Tutorial](https://vanviegen.github.io/aberdeen/Tutorial/)
- [Reference documentation](https://vanviegen.github.io/aberdeen/modules.html)

## News

- **2025-5-07**: After five years of working on this library on and off, I'm finally happy with its API and the developer experience it offers. I'm calling it 1.0! To celebrate, I've created some pretty fancy (if I may say so myself) interactive documentation and a tutorial.

## Roadmap

- [x] Support for (dis)appear transitions.
- [x] A better alternative for scheduleTask.
- [x] A simple router.
- [x] Optimistic client-side predictions.
- [x] Performance profiling and tuning regarding lists.
- [x] Support for (component local) CSS
- [ ] Architecture document.
- [ ] SVG support.
