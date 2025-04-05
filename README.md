A TypeScript/JavaScript library for quickly building performant declarative user interfaces *without* the use of a virtual DOM.

The key insight is the use of many small anonymous functions, that will automatically rerun when the underlying data changes. In order to trigger updates, that data should be encapsulated in any number of *proxied* JavaScript objects. They can hold anything, from simple values to complex and deeply nested data structures, in which case user-interface functions can (automatically) subscribe to just the parts they depend upon.

## Why use Aberdeen?

- It provides a flexible and simple to understand model for reactive user-interface building.
- It allows you to express user-interfaces in plain JavaScript (or TypeScript) in an easy to read form, without (JSX-like) compilation steps.
- It's fast, as it doesn't use a *virtual DOM* and only reruns small pieces of code in response to updated data. It also makes displaying and updating sorted lists very easy and very fast.
- It's lightweight, at about 5kb (minimized and gzipped) and without any run-time dependencies.
- It comes with batteries included, providing modules for..
  - Client-side routing.
  - Revertible patches, for optimistic user-interface updates.
  - A few transition effects.

## Examples

- [Tic-tac-toe demo](https://vanviegen.github.io/aberdeen/examples/tic-tac-toe/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/tic-tac-toe)
- [Input example demo](https://vanviegen.github.io/aberdeen/examples/input/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/input)
- [List example demo](https://vanviegen.github.io/aberdeen/examples/list/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/list)
- [Routing example demo](https://vanviegen.github.io/aberdeen/examples/router/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/router)


To get a quick impression of what Aberdeen code looks like, this is all of the JavaScript for the above Tic-tac-toe demo:

```javascript
import {$, mount, Store} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';

// Observable data
const squares = new Store([]) // eg. ['X', undefined, 'O', 'X']
const history = new Store([[]]) // eg. [[], [undefined, undefined, undefined, X], ...]
const historyPos = new Store(null) // set while 'time traveling' our undo history

// Derived data
const winner = squares.derive(calculateWinner) // 'X', 'O' or undefined
const player = squares.derive(sq => sq.filter(v => v).length % 2 ? "O" : "X") // 'X' or 'O'

// Rendering functions

function drawSquare(position) {
	$('button.square', () => {
		let value = squares(position).get()
		if (value) $({text: value})
		else $({click: () => fillSquare(position)})
	})
}

function drawBoard() {
	for(let y=0; y<3; y++) {
		$('div.board-row', () => {
			for(let x=0; x<3; x++) {
				drawSquare(y*3 + x)
			}
		})
	}
}

function drawInfo() {
	$('div', () => {
		if (winner.get()) {
			$({text: `Winner: ${winner.get()}!`})
		} else {
			$({text: `Current player: ${player.get()}`})	
		}
	})
	$('.buttons', () => {
		history.onEach(item => {
			$('button', {
				text: item.index() ? `Go to move ${item.index()}` : `Go to game start`,
				click: () => {
					historyPos.set(item.index())
					squares.set(item.get())
				},
			})
		})
	})
}

// Helper functions

function fillSquare(position) {
	// If there's already a winner, don't allow a new square to be filled
	if (winner.peek()) return

	// Fill the square
	squares(position).set(player.get())
	
	if (historyPos.get() != null) {
		// Truncate everything after history pos
		history.modify(h => h.slice(0, historyPos.get()+1))
		// Stop 'time traveling'
		historyPos.set(null)
	}
	
	// Append the current squares-state to the history array 
	history.push(squares.get())
}

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

// Fire it up!
 
mount(document.body, () => {
	$('.game', () => {
		$('.game-board', drawBoard)
		$('.game-info', drawInfo)
	})
})
```


## Reference documentation

https://vanviegen.github.io/aberdeen/modules.html


## Roadmap

- [x] Support for (dis)appear transitions.
- [x] A better alternative for scheduleTask.
- [x] A simple router.
- [x] Optimistic client-side predictions.
- [ ] Support for (component local) CSS or possibly a tailwind-like abstraction.
- [ ] More user friendly documentation generator.
- [ ] Architecture document.
- [ ] SVG support.
- [ ] Performance profiling and tuning regarding lists.
