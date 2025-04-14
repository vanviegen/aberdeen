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
import {$, proxy, onEach, copy} from "aberdeen";

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


## Reference documentation

https://vanviegen.github.io/aberdeen/modules.html


## Roadmap

- [x] Support for (dis)appear transitions.
- [x] A better alternative for scheduleTask.
- [x] A simple router.
- [x] Optimistic client-side predictions.
- [x] Performance profiling and tuning regarding lists.
- [x] Support for (component local) CSS
- [ ] Architecture document.
- [ ] SVG support.
