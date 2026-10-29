// Deterministic regeneration of the two runtime-reproduced fixture records.
// Mirrors tests/vnext/skill-selection.test.mjs exactly (same requests, same NOWs).
import fs from 'node:fs';
import path from 'node:path';
import { buildSkillRegistrySnapshot } from './runtime/skills/skill-registry-loader.mjs';
import { selectSkill } from './runtime/skills/skill-selector.mjs';

const ROOT = process.cwd();
const REVISION = 'c66cad6e8eedee982cf5d83d84e082aef51e3dbb';
const FIXTURE_PATH = path.join(ROOT, 'evals/fixtures/maws-vnext/skill-selection.contracts.json');
const before = fs.readFileSync(FIXTURE_PATH, 'utf8');
const oldDigestMatch = before.match(/"snapshot_digest":\s*"([0-9a-f]{64})"/);
const oldDigest = oldDigestMatch ? oldDigestMatch[1] : null;

const fixture = JSON.parse(before);
const snapshot = buildSkillRegistrySnapshot({ root: ROOT, revision: REVISION });
const allCaps = [...new Set(snapshot.skills.flatMap((s) => s.requires_capabilities))].sort();
const context = { available_capabilities: allCaps };
const mk = (o = {}) => ({
  request_id: 'req_intake_001',
  intent_fingerprint: 'a'.repeat(64),
  scope: 'intake-and-truth-mapping',
  required_capabilities: ['cap_repo_audit'],
  ...o
});
const happy = selectSkill({ request: mk(), registry_snapshot: snapshot, context, now: '2026-10-20T12:00:00Z' });
const tie = selectSkill({
  request: mk({ request_id: 'req_impl_tie_001', intent_fingerprint: 'b'.repeat(64), scope: 'implementation', required_capabilities: [] }),
  registry_snapshot: snapshot,
  context,
  now: '2026-10-20T12:05:00Z'
});
let n = 0;
for (const c of fixture.cases) {
  if (c.case_id === 'skill-selection-valid-selected-happy-path') { c.instance = happy; n++; }
  if (c.case_id === 'skill-selection-valid-selected-tie-break-order') { c.instance = tie; n++; }
}
if (n !== 2) throw new Error('expected to replace 2 cases, replaced ' + n);
const out = JSON.stringify(fixture, null, 2) + '\n';
if (oldDigest && out.includes(oldDigest)) throw new Error('old snapshot digest still present after regen: ' + oldDigest.slice(0, 16));
fs.writeFileSync(FIXTURE_PATH, out);
console.log('fixture regenerated; skills:', snapshot.skills.length, 'digest:', snapshot.snapshot_digest.slice(0, 16), 'old:', oldDigest ? oldDigest.slice(0, 16) : 'n/a');
