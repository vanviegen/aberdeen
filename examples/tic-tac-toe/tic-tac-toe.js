import {node, prop, mount, Store, text} from '../../dist/aberdeen.js';

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
