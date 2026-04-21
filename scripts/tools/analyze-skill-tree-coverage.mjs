#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive, parseSkillFrontmatter, repoRoot } from './_shared.mjs';

const DEFAULTS = {
  includeAgents: false,
  overconcentrationRatio: 0.3,
  json: false
};

const FAMILY_RULES = {
  'audit-readiness': ['audit', 'readiness', 'gate', 'blocker', 'verification', 'compliance'],
  'planning-breakdown': ['plan', 'planning', 'slice', 'breakdown', 'dependency', 'sequencing', 'task'],
  'contract-extraction': ['contract', 'extract', 'schema', 'interface', 'invariant', 'api', 'state', 'validation'],
  'synthesis-summarization': ['synthesis', 'summar', 'brief', 'narrative', 'knowledge', 'summary'],
  'risk-incident': ['failure', 'incident', 'risk', 'runbook', 'recovery', 'containment', 'escalation'],
  'ui-design': ['ui', 'ux', 'layout', 'screen', 'typography', 'design', 'interaction'],
  'deployment-runtime': ['deploy', 'deployment', 'runtime', 'environment', 'rollout', 'supabase', 'vercel'],
  'governance-mapping': ['governance', 'authority', 'mapping', 'intake', 'policy', 'canonical', 'conflict', 'source'],
  other: []
};

const FAMILY_ORDER = [
  'audit-readiness',
  'planning-breakdown',
  'contract-extraction',
  'synthesis-summarization',
  'risk-incident',
  'ui-design',
  'deployment-runtime',
  'governance-mapping',
  'other'
];

const PRIORITY_RELEVANCE = {
  'contract-extraction': 5,
  'risk-incident': 4,
  'governance-mapping': 4,
  'planning-breakdown': 3,
  'audit-readiness': 3,
  'deployment-runtime': 2,
  'synthesis-summarization': 2,
  'ui-design': 1,
  other: 0
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--include-agents') {
      args.includeAgents = true;
    } else if (value === '--json') {
      args.json = true;
    } else if (value === '--overconcentration-ratio' && argv[index + 1]) {
      args.overconcentrationRatio = Number(argv[index + 1]);
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

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
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

  return files.map((entry) => {
    const text = fs.readFileSync(entry.fullPath, 'utf8');
    let frontmatter = {};
    try {
      frontmatter = parseSkillFrontmatter(text);
    } catch {
      frontmatter = {};
    }
    const outputHeadings = parseSectionBullets(sectionContent(text, 'Output')).join(' ');
    const searchText = [
      frontmatter.name || '',
      frontmatter.description || '',
      outputHeadings
    ].join(' ');
    return {
      name: frontmatter.name || path.basename(path.dirname(entry.fullPath)),
      path: entry.relativePath,
      searchText
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function classifySkill(skill) {
  const tokens = tokenize(skill.searchText);
  const scoreByFamily = {};
  for (const family of FAMILY_ORDER) {
    if (family === 'other') continue;
    let score = 0;
    for (const keyword of FAMILY_RULES[family]) {
      for (const token of tokens) {
        if (token.includes(keyword)) score += 1;
      }
    }
    scoreByFamily[family] = score;
  }

  let bestFamily = 'other';
  let bestScore = 0;
  for (const family of FAMILY_ORDER) {
    if (family === 'other') continue;
    const score = scoreByFamily[family] || 0;
    if (score > bestScore) {
      bestScore = score;
      bestFamily = family;
    }
  }

  return {
    family: bestScore > 0 ? bestFamily : 'other',
    score: bestScore,
    scoreByFamily
  };
}

function analyzeSkillTreeCoverage(baseRoot = repoRoot(), options = DEFAULTS) {
  const skills = collectSkills(baseRoot, options.includeAgents);
  const total = skills.length;
  const overconcentrationThreshold = Math.max(1, Math.ceil(total * options.overconcentrationRatio));

  const skillsByFamily = {};
  for (const family of FAMILY_ORDER) {
    skillsByFamily[family] = [];
  }

  for (const skill of skills) {
    const classification = classifySkill(skill);
    skillsByFamily[classification.family].push({
      name: skill.name,
      path: skill.path,
      score: classification.score
    });
  }

  const familyCounts = {};
  for (const family of FAMILY_ORDER) {
    familyCounts[family] = skillsByFamily[family].length;
  }

  const weakCoverageFamilies = FAMILY_ORDER
    .filter((family) => familyCounts[family] <= 1)
    .map((family) => ({
      family,
      count: familyCounts[family]
    }));

  const overconcentratedFamilies = FAMILY_ORDER
    .filter((family) => familyCounts[family] >= overconcentrationThreshold)
    .map((family) => ({
      family,
      count: familyCounts[family],
      threshold: overconcentrationThreshold
    }));

  const expansionPriorities = weakCoverageFamilies
    .filter((entry) => entry.family !== 'other')
    .map((entry) => ({
      family: entry.family,
      count: entry.count,
      priorityScore: ((2 - entry.count) * 10) + (PRIORITY_RELEVANCE[entry.family] || 0),
      advisory: true
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore);

  return {
    ok: true,
    root: path.resolve(baseRoot).replace(/\\/g, '/'),
    scope: options.includeAgents ? ['core/skills', 'skills', '.agents/skills'] : ['core/skills', 'skills'],
    skillsAnalyzed: total,
    familyCounts,
    skillsByFamily,
    weakCoverageFamilies,
    overconcentratedFamilies,
    expansionPriorities,
    classificationRules: {
      families: FAMILY_RULES,
      precedence: FAMILY_ORDER,
      notes: 'Keyword-based deterministic classification. This is advisory coverage analysis, not taxonomy truth.'
    },
    limits: {
      weakCoverageThreshold: 1,
      overconcentrationRatio: options.overconcentrationRatio,
      overconcentrationThreshold
    }
  };
}

function printReport(report) {
  console.log('# Skill Tree Coverage Analysis');
  console.log('');
  console.log(`- root: ${report.root}`);
  console.log(`- scope: ${report.scope.join(', ')}`);
  console.log(`- skills analyzed: ${report.skillsAnalyzed}`);
  console.log(`- overconcentration threshold: ${report.limits.overconcentrationThreshold} skills/family`);
  console.log('');
  console.log('## Family Counts');
  for (const family of FAMILY_ORDER) {
    console.log(`- ${family}: ${report.familyCounts[family]}`);
  }
  console.log('');
  console.log('## Weak Coverage Families');
  if (report.weakCoverageFamilies.length === 0) {
    console.log('- none');
  } else {
    for (const entry of report.weakCoverageFamilies) {
      console.log(`- ${entry.family} (${entry.count})`);
    }
  }
  console.log('');
  console.log('## Overconcentrated Families');
  if (report.overconcentratedFamilies.length === 0) {
    console.log('- none');
  } else {
    for (const entry of report.overconcentratedFamilies) {
      console.log(`- ${entry.family} (${entry.count})`);
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const report = analyzeSkillTreeCoverage(repoRoot(), args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  process.exit(0);
}

export { analyzeSkillTreeCoverage };
