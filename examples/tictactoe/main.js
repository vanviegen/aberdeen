import {$, proxy, onEach, insertCss, observe} from '../../dist/aberdeen.js';

// UI drawing functions.

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

// Fire it up! Mounts on document.body by default..

drawMain();