import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, DIRECTIONS, queueDirection, spawnFood, stepGame } from './snake.logic.mjs';

test('createGame initializes a playable snake and places food off the body', () => {
  const game = createGame({ seed: 7 });

  assert.equal(game.snake.length, 3);
  assert.equal(game.direction.x, 1);
  assert.equal(game.direction.y, 0);
  assert.equal(game.score, 0);
  assert.equal(game.gameOver, false);
  assert.ok(game.food);
  assert.equal(game.snake.some((segment) => segment.x === game.food.x && segment.y === game.food.y), false);
});

test('stepGame advances the snake and supports queued turns', () => {
  const game = createGame({ seed: 7 });
  const queued = queueDirection(game, DIRECTIONS.down);
  const next = stepGame(queued);

  assert.equal(next.snake[0].x, game.snake[0].x + 1);
  assert.equal(next.snake[0].y, game.snake[0].y);
  assert.equal(next.direction.x, 1);
  assert.equal(next.queuedDirection, null);
});

test('snake grows and score increments when food is eaten', () => {
  const game = createGame({ seed: 7 });
  const eatingState = {
    ...game,
    food: { x: game.snake[0].x + 1, y: game.snake[0].y }
  };

  const next = stepGame(eatingState);

  assert.equal(next.score, 1);
  assert.equal(next.snake.length, eatingState.snake.length + 1);
  assert.equal(next.gameOver, false);
  assert.ok(next.food === null || next.snake.every((segment) => segment.x !== next.food.x || segment.y !== next.food.y));
});

test('wall collisions end the game', () => {
  const game = createGame({ seed: 7 });
  const trapped = {
    ...game,
    snake: [{ x: game.width - 1, y: 1 }, { x: game.width - 2, y: 1 }],
    direction: DIRECTIONS.right,
    food: { x: 0, y: 0 }
  };

  const next = stepGame(trapped);

  assert.equal(next.gameOver, true);
});

test('self collisions end the game', () => {
  const game = createGame({ seed: 7 });
  const trapped = {
    ...game,
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 }
    ],
    direction: DIRECTIONS.left,
    food: { x: 0, y: 0 }
  };

  const next = stepGame(trapped);

  assert.equal(next.gameOver, true);
});

test('spawnFood never places food on the snake and reports a full board', () => {
  const snake = [];
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      snake.push({ x, y });
    }
  }

  const spawn = spawnFood({ width: 2, height: 2, snake, seed: 1 });

  assert.equal(spawn.food, null);
  assert.equal(spawn.full, true);
});

