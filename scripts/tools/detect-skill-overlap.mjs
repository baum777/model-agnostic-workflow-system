#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive, parseSkillFrontmatter, repoRoot } from './_shared.mjs';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or',
  'that', 'the', 'their', 'this', 'to', 'use', 'when', 'with', 'without', 'not', 'do', 'does', 'must', 'can', 'should'
]);

const DEFAULTS = {
  includeAgents: false,
  json: false,
  nameThreshold: 0.82,
  boundaryThreshold: 0.72,
  ambiguityThreshold: 0.7
};

const BOUNDARY_MARKERS = [
  '## Boundary Differentiation',
  '## Nearest Sibling Skills',
  '## Non-Goals'
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--include-agents') {
      args.includeAgents = true;
    } else if (value === '--json') {
      args.json = true;
    } else if (value === '--name-threshold' && argv[index + 1]) {
      args.nameThreshold = Number(argv[index + 1]);
      index += 1;
    } else if (value === '--boundary-threshold' && argv[index + 1]) {
      args.boundaryThreshold = Number(argv[index + 1]);
      index += 1;
    } else if (value === '--ambiguity-threshold' && argv[index + 1]) {
      args.ambiguityThreshold = Number(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

function sectionContent(text, sectionHeading) {
  const escaped = sectionHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'm');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function parseSectionBullets(sectionText) {
  const lines = sectionText.split(/\r?\n/);
  const values = [];
  for (const line of lines) {
    const match = line.trim().match(/^-\s+(.+)$/);
    if (!match) continue;
    const cleaned = match[1].replace(/`/g, '').trim();
    if (cleaned) values.push(cleaned);
  }
  return values;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function tokenSet(value) {
  return new Set(tokenize(value));
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function diceCoefficient(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const bigrams = (text) => {
    const values = [];
    for (let i = 0; i < text.length - 1; i += 1) {
      values.push(text.slice(i, i + 2));
    }
    return values;
  };

  const leftBigrams = bigrams(a);
  const rightBigrams = bigrams(b);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return a === b ? 1 : 0;
  }

  const rightCounts = new Map();
  for (const value of rightBigrams) {
    rightCounts.set(value, (rightCounts.get(value) || 0) + 1);
  }
  let matches = 0;
  for (const value of leftBigrams) {
    const count = rightCounts.get(value) || 0;
    if (count > 0) {
      matches += 1;
      rightCounts.set(value, count - 1);
    }
  }
  return (2 * matches) / (leftBigrams.length + rightBigrams.length);
}

function scorePair(left, right) {
  const nameScore = Math.max(
    diceCoefficient(left.name, right.name),
    jaccard(tokenSet(left.name), tokenSet(right.name))
  );
  const descriptionScore = jaccard(tokenSet(left.description), tokenSet(right.description));
  const triggerScore = jaccard(tokenSet(left.trigger), tokenSet(right.trigger));
  const whenNotScore = jaccard(tokenSet(left.whenNot), tokenSet(right.whenNot));
  const outputScore = jaccard(new Set(left.outputHeadings), new Set(right.outputHeadings));
  const toolScore = jaccard(new Set(left.requiredTools), new Set(right.requiredTools));

  const boundaryScore = (
    (descriptionScore * 0.35) +
    (triggerScore * 0.25) +
    (outputScore * 0.2) +
    (whenNotScore * 0.1) +
    (toolScore * 0.1)
  );

  return {
    nameScore,
    descriptionScore,
    triggerScore,
    whenNotScore,
    outputScore,
    toolScore,
    boundaryScore
  };
}

function collectSkills(root, includeAgents) {
  const roots = [
    path.join(root, 'core', 'skills'),
    path.join(root, 'skills')
  ];
  if (includeAgents) {
    roots.push(path.join(root, '.agents', 'skills'));
  }

  const files = [];
  for (const skillRoot of roots) {
    if (!fs.existsSync(skillRoot)) continue;
    files.push(...listFilesRecursive(
      skillRoot,
      (_fullPath, relativePath) => relativePath.endsWith('/SKILL.md') || relativePath === 'SKILL.md',
      root
    ));
  }

  const seen = new Set();
  const skills = [];
  for (const entry of files) {
    if (seen.has(entry.relativePath)) continue;
    seen.add(entry.relativePath);

    const text = fs.readFileSync(entry.fullPath, 'utf8');
    let frontmatter = {};
    try {
      frontmatter = parseSkillFrontmatter(text);
    } catch {
      // Keep surface visible even if malformed.
    }
    const outputHeadingValues = parseSectionBullets(sectionContent(text, 'Output')).map((line) => slugify(line));
    const requiredTools = parseSectionBullets(sectionContent(text, 'Tool Requirements')).map((line) => slugify(line));
    const hasBoundaryMarker = BOUNDARY_MARKERS.some((marker) => text.includes(marker));

    skills.push({
      name: frontmatter.name || path.basename(path.dirname(entry.fullPath)),
      path: entry.relativePath,
      description: frontmatter.description || '',
      trigger: sectionContent(text, 'Trigger'),
      whenNot: sectionContent(text, 'When Not To Use'),
      outputHeadings: outputHeadingValues,
      requiredTools,
      hasBoundaryMarker,
      slug: slugify(frontmatter.name || path.basename(path.dirname(entry.fullPath)))
    });
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

function buildFindings(skills, options) {
  const findings = [];

  const slugToSkills = new Map();
  for (const skill of skills) {
    const values = slugToSkills.get(skill.slug) || [];
    values.push(skill);
    slugToSkills.set(skill.slug, values);
  }
  for (const [slug, collisions] of slugToSkills.entries()) {
    if (collisions.length <= 1) continue;
    for (let i = 0; i < collisions.length; i += 1) {
      for (let j = i + 1; j < collisions.length; j += 1) {
        findings.push({
          type: 'naming-collision',
          severity: 'high',
          skillA: collisions[i].name,
          skillB: collisions[j].name,
          score: 1,
          evidence: `Normalized slug collision on "${slug}".`,
          suggestedAction: 'Rename one skill or clarify canonical vs compatibility naming boundary.',
          certainty: 'heuristic'
        });
      }
    }
  }

  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const left = skills[i];
      const right = skills[j];
      const scores = scorePair(left, right);

      if (scores.nameScore >= options.nameThreshold && (scores.descriptionScore >= 0.45 || scores.triggerScore >= 0.45)) {
        findings.push({
          type: 'near-duplicate-skills',
          severity: scores.nameScore >= 0.9 ? 'high' : 'medium',
          skillA: left.name,
          skillB: right.name,
          score: Number(scores.nameScore.toFixed(3)),
          evidence: `High name similarity (${scores.nameScore.toFixed(2)}) with trigger/description overlap.`,
          suggestedAction: 'Confirm intentional split and add explicit boundary differentiation if both skills are needed.',
          certainty: 'heuristic'
        });
      }

      if (scores.boundaryScore >= options.boundaryThreshold && !(left.hasBoundaryMarker || right.hasBoundaryMarker)) {
        findings.push({
          type: 'weak-sibling-boundary',
          severity: 'medium',
          skillA: left.name,
          skillB: right.name,
          score: Number(scores.boundaryScore.toFixed(3)),
          evidence: `Boundary overlap score ${scores.boundaryScore.toFixed(2)} across description/trigger/output/tools with no explicit boundary markers.`,
          suggestedAction: 'Add boundary differentiation or nearest-sibling sections to reduce sibling ambiguity.',
          certainty: 'heuristic'
        });
      }

      if (scores.triggerScore >= options.ambiguityThreshold &&
          scores.outputScore >= options.ambiguityThreshold &&
          (!left.hasBoundaryMarker || !right.hasBoundaryMarker)) {
        findings.push({
          type: 'routing-ambiguity-risk',
          severity: (!left.hasBoundaryMarker && !right.hasBoundaryMarker) ? 'high' : 'medium',
          skillA: left.name,
          skillB: right.name,
          score: Number((((scores.triggerScore + scores.outputScore) / 2)).toFixed(3)),
          evidence: `Trigger overlap ${scores.triggerScore.toFixed(2)} and output overlap ${scores.outputScore.toFixed(2)} indicate routing collision risk.`,
          suggestedAction: 'Refine trigger boundaries or add explicit routing guardrails in skill docs.',
          certainty: 'heuristic'
        });
      }
    }
  }

  return findings;
}

function analyzeSkillOverlap(baseRoot = repoRoot(), options = DEFAULTS) {
  const skills = collectSkills(baseRoot, options.includeAgents);
  const findings = buildFindings(skills, options);
  const highCount = findings.filter((entry) => entry.severity === 'high').length;
  const mediumCount = findings.filter((entry) => entry.severity === 'medium').length;
  const lowCount = findings.filter((entry) => entry.severity === 'low').length;

  return {
    ok: highCount === 0,
    root: path.resolve(baseRoot).replace(/\\/g, '/'),
    scope: options.includeAgents ? ['core/skills', 'skills', '.agents/skills'] : ['core/skills', 'skills'],
    skillsAnalyzed: skills.length,
    findingsCount: findings.length,
    severities: {
      high: highCount,
      medium: mediumCount,
      low: lowCount
    },
    findings
  };
}

function printReport(report) {
  console.log('# Skill Overlap Detection');
  console.log('');
  console.log(`- root: ${report.root}`);
  console.log(`- scope: ${report.scope.join(', ')}`);
  console.log(`- skills analyzed: ${report.skillsAnalyzed}`);
  console.log(`- findings: ${report.findingsCount} (high=${report.severities.high}, medium=${report.severities.medium}, low=${report.severities.low})`);
  console.log('');
  if (report.findings.length === 0) {
    console.log('No overlap findings detected by current heuristics.');
    return;
  }
  console.log('## Findings');
  for (const finding of report.findings) {
    console.log(`- [${finding.severity}] ${finding.type}: ${finding.skillA} <> ${finding.skillB}`);
    console.log(`  score=${finding.score} certainty=${finding.certainty}`);
    console.log(`  evidence=${finding.evidence}`);
    console.log(`  suggestedAction=${finding.suggestedAction}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const report = analyzeSkillOverlap(repoRoot(), args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  process.exit(report.ok ? 0 : 1);
}

export { analyzeSkillOverlap };
