import { $, proxy, onEach, copy } from '../../dist/aberdeen.js';

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
