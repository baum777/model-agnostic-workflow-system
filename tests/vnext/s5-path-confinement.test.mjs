// MAWS vNext — S5 corpus path confinement (slice S5 path-confinement closure).
// node:test + node:assert/strict, no new dependencies.
//
// The S5 corpus loader reads material that must stay inside the corpus
// directory. A purely lexical check ("does the path start with the corpus?")
// is defeated by a symbolic link whose target lies outside, and by a
// symlinked parent directory that carries the read out of the corpus. The
// loader therefore confines every declared path in real terms and binds the
// read to a verified file descriptor.
//
// This file is the NEGATIVE half of the slice. The positive half — the
// shipped corpus still loads, still replays deterministically and still
// proves the candidate improvement — is covered by the unchanged regression
// suite in tests/vnext/run-skill-effectiveness.test.mjs.
//
// Proves:
//   - a case file that is a symlink out of the corpus is refused;
//   - a variant case file that is a symlink out of the corpus is refused;
//   - a case file reached through a symlinked parent directory is refused;
//   - a symlink that stays INSIDE the corpus is accepted and hashes
//     identically, so the confinement is not a blanket ban on links;
//   - an absolute path and a path that climbs out with ".." are refused;
//   - a target that is not a regular file (a directory, a FIFO) is refused
//     instead of being read;
//   - a target replaced between the containment check and the read is
//     detected;
//   - a corpus directory that resolves out of the repository is refused, at
//     the function boundary and through the CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  CORPUS_PATH_CODES,
  EvalConfigError,
  assertCorpusInsideRepository,
  loadCorpus,
  runSkillEffectivenessEval,
  runVariant
} from '../../scripts/tools/run-skill-effectiveness-evals.mjs';
import {
  PATH_CONFINEMENT_CODES,
  PathConfinementError,
  confineFileToBase,
  readConfinedFile
} from '../../scripts/tools/path-confinement.mjs';
import { validateBehavioralEvalRecord } from '../../scripts/tools/validate-behavioral-eval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_DIR = path.join(ROOT, 'evals', 'skill-effectiveness');
const RUNNER = path.join(ROOT, 'scripts', 'tools', 'run-skill-effectiveness-evals.mjs');
const CORPUS_FILES = [
  'corpus.json',
  'baseline/cases.json',
  'negative-cases/cases.json',
  'security-cases.json',
  'model-parity/cases.json',
  'candidates/cases.json'
];

function writeTempCorpus(mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's5-confinement-'));
  for (const entry of CORPUS_FILES) {
    const target = path.join(tmp, entry);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(CORPUS_DIR, entry), target);
  }
  mutate(tmp);
  return tmp;
}

function readManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'corpus.json'), 'utf8'));
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, 'corpus.json'), JSON.stringify(manifest, null, 2));
}

function outsideCorpusFile() {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's5-outside-'));
  const cases = path.join(outside, 'cases.json');
  fs.copyFileSync(path.join(CORPUS_DIR, 'negative-cases', 'cases.json'), cases);
  return { outside, cases };
}

test('a case file that is a symlink out of the corpus is refused', () => {
  const { outside, cases } = outsideCorpusFile();
  const tmp = writeTempCorpus((dir) => {
    const link = path.join(dir, 'negative-cases', 'cases.json');
    fs.unlinkSync(link);
    fs.symlinkSync(cases, link);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_SYMLINK_ESCAPE'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('a variant case file that is a symlink out of the corpus is refused', () => {
  const { outside, cases } = outsideCorpusFile();
  const tmp = writeTempCorpus((dir) => {
    const link = path.join(dir, 'candidates', 'cases.json');
    fs.unlinkSync(link);
    fs.symlinkSync(cases, link);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_SYMLINK_ESCAPE'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('a case file reached through a symlinked parent directory is refused', () => {
  const { outside, cases } = outsideCorpusFile();
  const tmp = writeTempCorpus((dir) => {
    const familyDir = path.join(dir, 'negative-cases');
    fs.unlinkSync(path.join(familyDir, 'cases.json'));
    fs.rmdirSync(familyDir);
    fs.symlinkSync(outside, familyDir);
  });
  try {
    // The declared path is lexically inside the corpus; only the real path
    // leaves it. A lexical check alone would have accepted this corpus.
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_SYMLINK_ESCAPE'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('a symlink that stays inside the corpus is accepted and hashes identically', async () => {
  const linked = writeTempCorpus((dir) => {
    const link = path.join(dir, 'negative-cases', 'cases.json');
    const target = path.join(dir, 'negative-cases', 'linked-cases.json');
    fs.copyFileSync(link, target);
    fs.unlinkSync(link);
    fs.symlinkSync(target, link);
  });
  const direct = writeTempCorpus(() => {});
  try {
    const linkedCorpus = loadCorpus(linked);
    const directCorpus = loadCorpus(direct);
    const linkedRecord = await runVariant({ corpus: linkedCorpus, variant: 'BASELINE', mode: 'recorded_replay', evalId: 'bev_link_probe' });
    const directRecord = await runVariant({ corpus: directCorpus, variant: 'BASELINE', mode: 'recorded_replay', evalId: 'bev_link_probe' });
    const linkedFamily = linkedRecord.case_families.find((family) => family.family === 'negative');
    const directFamily = directRecord.case_families.find((family) => family.family === 'negative');
    assert.equal(linkedFamily.corpus_digest, directFamily.corpus_digest);
    assert.equal(linkedRecord.reproducibility.corpus_digest, directRecord.reproducibility.corpus_digest);
  } finally {
    fs.rmSync(linked, { recursive: true, force: true });
    fs.rmSync(direct, { recursive: true, force: true });
  }
});

test('an absolute case file path is refused', () => {
  const tmp = writeTempCorpus((dir) => {
    const manifest = readManifest(dir);
    manifest.families[1].file = path.join(CORPUS_DIR, 'negative-cases', 'cases.json');
    writeManifest(dir, manifest);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_ESCAPES_ROOT'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a case file path that climbs out of the corpus is refused', () => {
  const tmp = writeTempCorpus((dir) => {
    const manifest = readManifest(dir);
    manifest.families[1].file = '../outside.json';
    writeManifest(dir, manifest);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_ESCAPES_ROOT'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a case file that is a directory is refused instead of being read', () => {
  const tmp = writeTempCorpus((dir) => {
    const target = path.join(dir, 'negative-cases', 'cases.json');
    fs.unlinkSync(target);
    fs.mkdirSync(target);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_NOT_A_FILE'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a case file that is a FIFO is refused instead of blocking the reader', { timeout: 20000 }, (t) => {
  const tmp = writeTempCorpus((dir) => {
    const target = path.join(dir, 'negative-cases', 'cases.json');
    fs.unlinkSync(target);
    try {
      execFileSync('mkfifo', [target]);
    } catch {
      t.skip('mkfifo is not available in this environment');
    }
  });
  try {
    if (!fs.existsSync(path.join(tmp, 'negative-cases', 'cases.json')) || fs.lstatSync(path.join(tmp, 'negative-cases', 'cases.json')).isDirectory()) {
      t.skip('the FIFO could not be created in this environment');
      return;
    }
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_NOT_A_FILE'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a target replaced between the containment check and the read is detected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's5-swap-'));
  try {
    const target = path.join(dir, 'cases.json');
    fs.writeFileSync(target, '{"cases":[]}\n');
    const confined = confineFileToBase(dir, 'cases.json');
    // The replacement is created FIRST and then renamed over the target, so
    // it carries a different inode by construction rather than by luck.
    const replacement = path.join(dir, 'replacement.json');
    fs.writeFileSync(replacement, '{"cases":[{"case_id":"se_replacement"}]}\n');
    fs.renameSync(replacement, target);
    assert.throws(
      () => readConfinedFile(confined),
      (error) => error instanceof PathConfinementError && error.code === PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the corpus error vocabulary maps the read-time refusal to a corpus code', () => {
  assert.equal(
    CORPUS_PATH_CODES[PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION],
    'CORPUS_PATH_CHANGED'
  );
  assert.equal(
    CORPUS_PATH_CODES[PATH_CONFINEMENT_CODES.ESCAPES_BASE_THROUGH_SYMLINK],
    'CORPUS_PATH_SYMLINK_ESCAPE'
  );
  assert.equal(
    CORPUS_PATH_CODES[PATH_CONFINEMENT_CODES.NOT_A_FILE],
    'CORPUS_PATH_NOT_A_FILE'
  );
  assert.equal(
    CORPUS_PATH_CODES[PATH_CONFINEMENT_CODES.MULTIPLE_LINKS],
    'CORPUS_PATH_MULTIPLE_LINKS'
  );
});

test('a FIFO swapped in after the check cannot block the read', { timeout: 20000 }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's5-fifo-swap-'));
  try {
    const target = path.join(dir, 'cases.json');
    fs.writeFileSync(target, '{"cases":[]}\n');
    const confined = confineFileToBase(dir, 'cases.json');
    // The target is replaced by a FIFO in the window between the
    // containment check and the read. The open must not wait for a writer.
    fs.unlinkSync(target);
    let fifoCreated = true;
    try {
      execFileSync('mkfifo', [target]);
    } catch {
      fifoCreated = false;
    }
    if (!fifoCreated) {
      t.skip('mkfifo is not available in this environment');
      return;
    }
    assert.throws(
      () => readConfinedFile(confined),
      (error) => error instanceof PathConfinementError && error.code === PATH_CONFINEMENT_CODES.NOT_A_FILE
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a case file that is a hardlink to a file outside the corpus is refused', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's5-hardlink-outside-'));
  const tmp = writeTempCorpus((dir) => {
    const outsideCases = path.join(outside, 'cases.json');
    fs.copyFileSync(path.join(CORPUS_DIR, 'negative-cases', 'cases.json'), outsideCases);
    const link = path.join(dir, 'negative-cases', 'cases.json');
    fs.unlinkSync(link);
    fs.linkSync(outsideCases, link);
  });
  try {
    // A hardlink has no path of its own: the real path of the link is its
    // own path inside the corpus, so only the link count reveals that the
    // same material also exists under a name outside the corpus.
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_MULTIPLE_LINKS'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('a parent directory replaced after the check is detected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's5-parent-swap-'));
  try {
    const familyDir = path.join(dir, 'family');
    fs.mkdirSync(familyDir);
    const target = path.join(familyDir, 'cases.json');
    fs.writeFileSync(target, '{"cases":[]}\n');
    const confined = confineFileToBase(dir, 'family/cases.json');
    // The parent directory is replaced by a new directory that carries the
    // SAME file inode, so only the parent identity tells the two apart.
    const original = fs.statSync(target);
    fs.renameSync(familyDir, path.join(dir, 'family-original'));
    fs.mkdirSync(familyDir);
    fs.linkSync(path.join(dir, 'family-original', 'cases.json'), target);
    const swapped = fs.statSync(target);
    assert.equal(swapped.ino, original.ino, 'the file inode is unchanged; only the parent differs');
    assert.throws(
      () => readConfinedFile(confined),
      (error) => error instanceof PathConfinementError
        && error.code === PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION
        && /parent directory/.test(error.message)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a manifest without variants is refused with a corpus code', () => {
  const tmp = writeTempCorpus((dir) => {
    const manifest = readManifest(dir);
    delete manifest.variants;
    writeManifest(dir, manifest);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_VARIANTS_INVALID'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a family that declares an unknown via is refused', () => {
  const tmp = writeTempCorpus((dir) => {
    const manifest = readManifest(dir);
    manifest.families[1].via = 'somewhere-else';
    writeManifest(dir, manifest);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_FAMILY_INVALID'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a blocking family that would contribute no case is refused', () => {
  const tmp = writeTempCorpus((dir) => {
    const manifest = readManifest(dir);
    // A family declared "via: variant" other than the positive family never
    // has its file read, so it would contribute no case at all — and a
    // blocking family that can never fail can never block.
    manifest.families.push({
      family: 'security_regression',
      file: '../../outside/ghost-security.json',
      via: 'variant',
      blocking: true
    });
    writeManifest(dir, manifest);
  });
  try {
    assert.throws(
      () => loadCorpus(tmp),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_FAMILY_INVALID'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a corpus directory outside the repository is refused', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's5-corpus-outside-'));
  try {
    assert.throws(
      () => assertCorpusInsideRepository(ROOT, outside),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_DIR_ESCAPES_REPO'
    );
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('a corpus directory that resolves out of the repository is refused', () => {
  // A fake repository root in a temp directory: the corpus inside it is a
  // symbolic link to a corpus elsewhere, so the DECLARED path is inside the
  // root while the material is not. The check must judge the real path.
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 's5-fake-repo-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's5-corpus-outside-'));
  try {
    fs.copyFileSync(path.join(CORPUS_DIR, 'corpus.json'), path.join(outside, 'corpus.json'));
    fs.symlinkSync(outside, path.join(fakeRoot, 'corpus'));
    assert.throws(
      () => assertCorpusInsideRepository(fakeRoot, 'corpus'),
      (error) => error instanceof EvalConfigError && error.code === 'CORPUS_DIR_ESCAPES_REPO'
    );
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('a corpus path that leaves the repository is refused at the CLI', () => {
  // The CLI's corpus path is anchored at the repository root, so a path
  // that climbs out of it is refused before anything is read. This needs no
  // write into the repository at all.
  const result = spawnSync(process.execPath, [RUNNER, '--corpus', '../outside-corpus'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /must stay inside the repository/);
});

test('a corpus directory that resolves out of the repository is refused at the CLI', () => {
  // The link lives inside the repository on purpose: a purely lexical check
  // would accept it, and the corpus it names is outside the tree. It is
  // created under artifacts/, the repository's own ignored output
  // directory, so that a run that dies before the cleanup leaves no
  // tracked residue behind.
  const holder = fs.mkdtempSync(path.join(ROOT, 'artifacts', '.s5-confinement-tmp-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 's5-corpus-outside-'));
  try {
    fs.copyFileSync(path.join(CORPUS_DIR, 'corpus.json'), path.join(outside, 'corpus.json'));
    const link = path.join(holder, 'corpus');
    fs.symlinkSync(outside, link);
    const result = spawnSync(process.execPath, [RUNNER, '--corpus', path.relative(ROOT, link)], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    assert.equal(result.status, 3);
    assert.match(result.stderr, /must stay inside the repository/);
  } finally {
    fs.rmSync(holder, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('the shipped corpus still loads and still proves the candidate improvement', async () => {
  const corpus = loadCorpus(CORPUS_DIR);
  assert.deepEqual([...corpus.families.keys()], ['positive', 'negative', 'security_regression', 'model_parity']);
  const { candidateRecord, finalVerdict } = await runSkillEffectivenessEval({ corpus, mode: 'recorded_replay' });
  assert.equal(finalVerdict, 'IMPROVEMENT_PROVEN');
  assert.equal(candidateRecord.security_gate.gate, 'PASS');
  assert.deepEqual(validateBehavioralEvalRecord(candidateRecord, ROOT), []);
});

test('the committed S5 eval records still validate against the current runner', () => {
  const evidenceDir = path.join(ROOT, 'evidence', 'skill-effectiveness-evals-2026-10-20');
  for (const name of ['baseline', 'candidate']) {
    const record = JSON.parse(fs.readFileSync(path.join(evidenceDir, `eval-record-bev-skill-effectiveness-${name}.json`), 'utf8'));
    assert.deepEqual(validateBehavioralEvalRecord(record, ROOT), [], `${name} record still validates`);
  }
});
