import { DIRECTIONS, createGame, queueDirection, stepGame } from './snake.logic.mjs';

const board = document.getElementById('board');
const context = board.getContext('2d');
const scoreLabel = document.getElementById('score');
const statusLabel = document.getElementById('status');
const restartButton = document.getElementById('restart');
const touchButtons = document.querySelectorAll('.touch-controls button');

const CELL_SIZE = 20;
const GRID_LINE = 'rgba(36, 48, 61, 0.07)';
const BOARD_COLOR = '#f8fbf7';
const SNAKE_COLOR = '#1f6f50';
const SNAKE_HEAD_COLOR = '#11533b';
const FOOD_COLOR = '#b1452f';
const FRAME_MS = 130;

let game = createGame();
let tickHandle = null;

function setStatus(text) {
  statusLabel.textContent = text;
}

function resetGame() {
  game = createGame();
  scoreLabel.textContent = String(game.score);
  setStatus('Use arrows or WASD to start.');
  render();
}

function queueMove(direction) {
  game = queueDirection(game, direction);
}

function drawCell(x, y, color, inset = 0) {
  context.fillStyle = color;
  context.fillRect(x * CELL_SIZE + inset, y * CELL_SIZE + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2);
}

function renderGrid() {
  context.fillStyle = BOARD_COLOR;
  context.fillRect(0, 0, board.width, board.height);

  context.strokeStyle = GRID_LINE;
  context.lineWidth = 1;
  for (let x = 0; x <= game.width; x += 1) {
    const offset = x * CELL_SIZE + 0.5;
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset, board.height);
    context.stroke();
  }

  for (let y = 0; y <= game.height; y += 1) {
    const offset = y * CELL_SIZE + 0.5;
    context.beginPath();
    context.moveTo(0, offset);
    context.lineTo(board.width, offset);
    context.stroke();
  }
}

function render() {
  renderGrid();

  if (game.food) {
    drawCell(game.food.x, game.food.y, FOOD_COLOR, 4);
  }

  game.snake.forEach((segment, index) => {
    drawCell(segment.x, segment.y, index === 0 ? SNAKE_HEAD_COLOR : SNAKE_COLOR, 3);
  });

  scoreLabel.textContent = String(game.score);

  if (game.gameOver) {
    setStatus(game.won ? 'Board cleared. Press Restart.' : 'Game over. Press Restart.');
    context.fillStyle = 'rgba(255, 250, 242, 0.7)';
    context.fillRect(0, 0, board.width, board.height);
    context.fillStyle = '#24303d';
    context.font = '700 28px Inter, system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(game.won ? 'You win' : 'Game over', board.width / 2, board.height / 2 - 14);
    context.font = '500 14px Inter, system-ui, sans-serif';
    context.fillText('Press Restart', board.width / 2, board.height / 2 + 18);
  } else if (game.score > 0) {
    setStatus('Keep going.');
  }
}

function advance() {
  if (game.gameOver) {
    return;
  }

  game = stepGame(game);
  render();
}

function startLoop() {
  if (tickHandle !== null) {
    return;
  }

  tickHandle = window.setInterval(advance, FRAME_MS);
}

function stopLoop() {
  if (tickHandle === null) {
    return;
  }

  window.clearInterval(tickHandle);
  tickHandle = null;
}

function handleKeyDown(event) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (key === 'r') {
    event.preventDefault();
    resetGame();
    return;
  }

  const directionMap = {
    ArrowUp: DIRECTIONS.up,
    ArrowDown: DIRECTIONS.down,
    ArrowLeft: DIRECTIONS.left,
    ArrowRight: DIRECTIONS.right,
    w: DIRECTIONS.up,
    a: DIRECTIONS.left,
    s: DIRECTIONS.down,
    d: DIRECTIONS.right
  };

  if (directionMap[key]) {
    event.preventDefault();
    queueMove(directionMap[key]);
  }
}

restartButton.addEventListener('click', resetGame);
window.addEventListener('keydown', handleKeyDown);
touchButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const direction = button.getAttribute('data-direction');
    if (direction && DIRECTIONS[direction]) {
      queueMove(DIRECTIONS[direction]);
    }
  });
});

window.addEventListener('blur', () => {
  stopLoop();
});

window.addEventListener('focus', () => {
  startLoop();
});

resetGame();
startLoop();

