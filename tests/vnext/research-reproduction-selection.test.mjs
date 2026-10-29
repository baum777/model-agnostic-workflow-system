import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildSkillRegistrySnapshot } from '../../runtime/skills/skill-registry-loader.mjs';
import { selectSkill } from '../../runtime/skills/skill-selector.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const snapshot = buildSkillRegistrySnapshot({ root, revision: 'skill-complement-closure-candidate-20261028' });
const context = { available_capabilities: [...new Set(snapshot.skills.flatMap(s => s.requires_capabilities))] };
function select(id, capability, input) {
  const intent = crypto.createHash('sha256').update(input).digest('hex');
  return selectSkill({ request: { request_id: id, intent_fingerprint: intent,
    scope: 'verification-and-review', required_capabilities: [capability] },
    registry_snapshot: snapshot, context, now: '2026-10-28T00:00:00Z' });
}
test('reproduction assessment is selected by the real scoped selector without a forced candidate', () => {
  const paper = fs.readFileSync(path.join(root, 'evidence/skill-frontdoor-complements-20261028/behavior/cases/research-reproduction-review/pos-standard/paper-excerpt.md'));
  const result = select('req_paper_reproduction_review', 'cap_research_reproduction_review', paper);
  assert.equal(result.outcome, 'SELECTED');
  assert.equal(result.selection.skill_id, 'core.research-reproduction-review');
  assert.equal(result.authority_granted, false);
});
test('literature synthesis selects its own skill and excludes reproduction review', () => {
  const result = select('req_literature_synthesis', 'cap_research_synthesis', 'Synthesize supplied literature excerpts and cite agreement, conflicts and uncertainty. Do not design or run a reproduction.');
  assert.equal(result.selection.skill_id, 'core.research-synthesis');
  assert.ok(result.eligibility.some(e => e.skill_id === 'core.research-reproduction-review' && e.verdict === 'INELIGIBLE'));
  assert.equal(result.authority_granted, false);
});
test('missing required tool capability cannot be cured by routing', () => {
  const result = selectSkill({ request: { request_id: 'req_tools_absent', intent_fingerprint: 'a'.repeat(64),
    scope: 'verification-and-review', required_capabilities: ['cap_research_reproduction_review'] },
    registry_snapshot: snapshot, context: { available_capabilities: [] } });
  assert.equal(result.outcome, 'REFUSED');
  assert.equal(result.authority_granted, false);
});
