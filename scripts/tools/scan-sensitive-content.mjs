#!/usr/bin/env node
// Sensitive content scan for persisted evidence (the P2a reconciliation gate).
//
// The evidence content manifests prove completeness and structure of the
// persisted evidence; they are NOT a proof that the evidence is free of
// secrets or personal data. The repository secret scanner covers
// docs/, examples/, evals/, templates/, policies/ and provider exports —
// evidence/ is outside its file patterns, so this tool closes that gap
// explicitly and separately.
//
// Secret detection reuses the owner patterns from scan-secrets.mjs (one
// pattern source of truth). PII detection is a HONEST HEURISTIC (email
// addresses, private key headers, well-known token shapes) — a pass here is
// not a compliance claim, it is a scan result with named pattern classes.
//
// Baselined findings work like the source security baseline: a finding the
// evidence legitimately contains (e.g. a documentation email) is disclosed
// with a justification; a NEW finding fails the gate, and so does a baseline
// entry that no longer matches (staleness). Findings are reported with a
// sha256 of the matched text, never the text itself, so the artifact cannot
// become the leak it reports.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { SECRET_PATTERNS } from './scan-secrets.mjs';
import { repoRoot } from './_shared.mjs';

const PII_PATTERNS = [
  { name: 'email-address', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: 'private-key-header', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g }
];

const EXTRA_SECRET_PATTERNS = [
  { name: 'github-token', regex: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'slack-token', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g }
];

const ALL_PATTERNS = [
  ...SECRET_PATTERNS.map((pattern) => ({ ...pattern, class: 'secret' })),
  ...EXTRA_SECRET_PATTERNS.map((pattern) => ({ ...pattern, class: 'secret' })),
  ...PII_PATTERNS.map((pattern) => ({ ...pattern, class: 'pii-heuristic' }))
];

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function scanSensitiveContent({ root, target, baseline }) {
  const absoluteTarget = path.resolve(root, target);
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      files.push(absolute);
    }
  };
  walk(absoluteTarget);

  const findings = [];
  const scanned = [];
  for (const absolute of files) {
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    const content = fs.readFileSync(absolute, 'utf8');
    scanned.push({ file: relative, sha256: sha256(content) });
    const lines = content.split('\n');
    for (const pattern of ALL_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push({
          file: relative,
          line,
          pattern: pattern.name,
          class: pattern.class,
          context: lines[line - 1].trim().slice(0, 80).replace(match[0], '<REDACTED>'),
          excerpt_sha256: sha256(match[0])
        });
      }
    }
  }

  const baselineKeys = new Set((baseline?.entries || []).map((entry) => `${entry.file}|${entry.pattern}|${entry.excerpt_sha256}`));
  const baselined = findings.filter((finding) => baselineKeys.has(`${finding.file}|${finding.pattern}|${finding.excerpt_sha256}`));
  const unbaselined = findings.filter((finding) => !baselineKeys.has(`${finding.file}|${finding.pattern}|${finding.excerpt_sha256}`));
  const matchedKeys = new Set(findings.map((finding) => `${finding.file}|${finding.pattern}|${finding.excerpt_sha256}`));
  const stale = (baseline?.entries || []).filter((entry) => !matchedKeys.has(`${entry.file}|${entry.pattern}|${entry.excerpt_sha256}`));

  return {
    ok: unbaselined.length === 0 && stale.length === 0,
    target,
    files_scanned: files.length,
    scanned,
    finding_count: findings.length,
    baselined_count: baselined.length,
    unbaselined,
    stale_baseline_entries: stale,
    pattern_classes: ALL_PATTERNS.map((pattern) => `${pattern.class}:${pattern.name}`),
    claim_note: 'a pass is a scan result over the named pattern classes, not a proof that no sensitive content can exist'
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const root = flag('--root') ? path.resolve(flag('--root')) : repoRoot();
  const target = flag('--target');
  const baselinePath = flag('--baseline');
  const jsonOut = flag('--json');
  if (!target) {
    console.error('usage: scan-sensitive-content.mjs --target <dir> [--root <repo>] [--baseline <json>] [--json <out>]');
    process.exit(2);
  }
  const baseline = baselinePath ? JSON.parse(fs.readFileSync(path.resolve(baselinePath), 'utf8')) : null;
  const result = scanSensitiveContent({ root, target, baseline });
  const stdout = [
    `sensitive content scan: ${result.ok ? 'PASS' : 'FAIL'}`,
    `target ${result.target}: ${result.files_scanned} files, ${result.finding_count} findings (${result.baselined_count} baselined, ${result.unbaselined.length} unbaselined, ${result.stale_baseline_entries.length} stale)`,
    ...result.unbaselined.map((finding) => `  UNBASELINED ${finding.class} ${finding.pattern} ${finding.file}:${finding.line}`),
    ...result.stale_baseline_entries.map((entry) => `  STALE ${entry.pattern} ${entry.file}`)
  ].join('\n');
  console.log(stdout);
  if (jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(result, null, 2) + '\n');
  }
  process.exit(result.ok ? 0 : 1);
}
