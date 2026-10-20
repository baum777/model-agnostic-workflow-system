import test from 'node:test';
import assert from 'node:assert/strict';
import { minimaxAdapter } from '../../providers/minimax/adapter.mjs';

test('MiniMax adapter imports canonical provider base and exports normalization functions', () => {
  assert.equal(typeof minimaxAdapter.normalizeSkillCall, 'function');
  assert.equal(typeof minimaxAdapter.normalizeOutput, 'function');
});
