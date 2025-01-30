import {$, mount, Store} from '../../dist/aberdeen.js';

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
