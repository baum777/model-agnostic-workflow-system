const DEFAULT_WIDTH = 20;
const DEFAULT_HEIGHT = 20;
const DEFAULT_SEED = 1;
const INITIAL_LENGTH = 3;

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
  right: Object.freeze({ x: 1, y: 0 })
});

function keyFor(position) {
  return `${position.x}:${position.y}`;
}

function clonePosition(position) {
  return { x: position.x, y: position.y };
}

function isOpposite(first, second) {
  return first.x + second.x === 0 && first.y + second.y === 0;
}

function nextSeed(seed) {
  return (seed * 1664525 + 1013904223) >>> 0;
}

function buildSnake(width, height) {
  const headX = Math.floor(width / 2);
  const headY = Math.floor(height / 2);
  return [
    { x: headX, y: headY },
    { x: headX - 1, y: headY },
    { x: headX - 2, y: headY }
  ].slice(0, INITIAL_LENGTH);
}

export function spawnFood({ width, height, snake, seed = DEFAULT_SEED }) {
  const occupied = new Set(snake.map(keyFor));
  const openCells = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!occupied.has(`${x}:${y}`)) {
        openCells.push({ x, y });
      }
    }
  }

  if (openCells.length === 0) {
    return { food: null, seed, full: true };
  }

  const next = nextSeed(seed);
  return {
    food: clonePosition(openCells[next % openCells.length]),
    seed: next,
    full: false
  };
}

export function createGame(options = {}) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const seed = options.seed ?? DEFAULT_SEED;
  const snake = buildSnake(width, height);
  const spawn = spawnFood({ width, height, snake, seed });

  return {
    width,
    height,
    snake,
    direction: clonePosition(DIRECTIONS.right),
    queuedDirection: null,
    food: spawn.food,
    score: 0,
    gameOver: spawn.full,
    won: spawn.full,
    seed: spawn.seed
  };
}

export function queueDirection(state, nextDirection) {
  if (state.gameOver) {
    return state;
  }

  const normalized = {
    x: nextDirection.x,
    y: nextDirection.y
  };

  if ((normalized.x === 0 && normalized.y === 0) || Number.isNaN(normalized.x) || Number.isNaN(normalized.y)) {
    return state;
  }

  const currentDirection = state.queuedDirection ?? state.direction;
  if (state.snake.length > 1 && isOpposite(currentDirection, normalized)) {
    return state;
  }

  return {
    ...state,
    queuedDirection: normalized
  };
}

export function stepGame(state) {
  if (state.gameOver) {
    return state;
  }

  const direction = state.queuedDirection ?? state.direction;
  const head = state.snake[0];
  const nextHead = {
    x: head.x + direction.x,
    y: head.y + direction.y
  };

  if (nextHead.x < 0 || nextHead.x >= state.width || nextHead.y < 0 || nextHead.y >= state.height) {
    return {
      ...state,
      direction: clonePosition(direction),
      queuedDirection: null,
      gameOver: true
    };
  }

  const eating = state.food !== null && nextHead.x === state.food.x && nextHead.y === state.food.y;
  const bodyToCheck = eating ? state.snake : state.snake.slice(0, -1);
  const selfCollision = bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

  if (selfCollision) {
    return {
      ...state,
      direction: clonePosition(direction),
      queuedDirection: null,
      gameOver: true
    };
  }

  const nextSnake = [nextHead, ...state.snake.map(clonePosition)];
  if (!eating) {
    nextSnake.pop();
  }

  if (!eating) {
    return {
      ...state,
      snake: nextSnake,
      direction: clonePosition(direction),
      queuedDirection: null
    };
  }

  const spawn = spawnFood({
    width: state.width,
    height: state.height,
    snake: nextSnake,
    seed: state.seed
  });

  return {
    ...state,
    snake: nextSnake,
    direction: clonePosition(direction),
    queuedDirection: null,
    food: spawn.food,
    score: state.score + 1,
    seed: spawn.seed,
    gameOver: spawn.full,
    won: spawn.full
  };
}

