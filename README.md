A TypeScript/JavaScript library for quickly building performant declarative user interfaces *without* the use of a virtual DOM.

The key insight is the use of many small anonymous functions, that will automatically rerun when the underlying data changes. In order to trigger updates, that data should be encapsulated in any number of `Store` objects. They can hold anything, from simple values to deeply nested data structures, in which case user-interface functions can (automatically) subscribe to just the parts they depend upon.


## Why use Aberdeen?

- It provides a flexible and simple to understand model for reactive user-interface building.
- It allows you to express user-interfaces in plain JavaScript (or TypeScript) in an easy to read form, without (JSX-like) compilation steps.
- It's fast, as it doesn't use a *virtual DOM* and only reruns small pieces of code in response to updated data. It also makes displaying and updating sorted lists very easy and very fast.
- It's lightweight, at about 15kb minimized.


## Examples

- [Tic-tac-toe demo](https://vanviegen.github.io/aberdeen/examples/tic-tac-toe/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/tic-tac-toe)
- [Input example demo](https://vanviegen.github.io/aberdeen/examples/input/) - [Source](https://github.com/vanviegen/aberdeen/tree/master/examples/input)


To get a quick impression of what Aberdeen code looks like, this is all of the JavaScript for the above Tic-tac-toe demo:

```javascript
import {node, prop, mount, Store, text} from 'https://cdn.jsdelivr.net/npm/aberdeen/+esm';

const store = new Store({
	squares: [],
	turn: 'X',
	history: [{}],
})

const drawSquare = (position) => {
	node('button.square', () => {
		let value = store.get('squares', position)
		if (value) text(value)
		else prop('click', () => fillSquare(position))
	})
}

const drawBoard = () => {
	for(let y=0; y<3; y++) {
		node('div.board-row', () => {
			for(let x=0; x<3; x++) {
				drawSquare(y*3 + x)
			}
		})
	}
}

const drawInfo = () => {
	node('div', () => {
		let winner = calculateWinner(store.get('squares'))
		if (winner) {
			text(`Winner: ${winner}`)
		} else {
			text(`Next player: ${store.get('turn')}`)			
		}
	})
	node('ol', () => {
		store.onEach('history', item => {
			node('li', () => {
				node('button', () => {
					text(item.index() ? `Go to move ${item.index()}` : `Go to game start`)
					prop('click', () => {
						store.set('historyPos', item.index())
						store.set('squares', item.get())
					})
				})
			})
		})
	})
}

const fillSquare = (position) => {
	// If there's already a winner, don't allow a new square to be filled
	if (calculateWinner(store.get('squares'))) return

	// Fill the square
	store.set('squares', position, store.get('turn'))
	
	// Next player's turn
	store.set('turn', store.get('turn')==='X' ? 'O' : 'X')
	
	if (store.get('historyPos') != null) {
		// Truncate everything after history pos
		store.set('history', store.get('history').slice(0,store.get('historyPos')+1))
		// Stop 'time traveling'
		store.delete('historyPos')
	}
	
	// Append the current squares-state to the history array 
	store.push('history', store.get('squares'))
}

const calculateWinner = (squares) => {
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
 
mount(document.body, () => {
	node('div.game', () => {
		node('div.game-board', drawBoard)
		node('div.game-info', drawInfo)
	})
})
```


## Reference documentation

https://vanviegen.github.io/aberdeen/modules.html
