// MAWS vNext — S3 wave 2 advisory signal layer (MAWS-SII-TARGET-SPEC-001).
//
// Wave 1 of the auditor implemented the two statically decidable classes of
// the section 6.2 taxonomy and declared the remaining eight as not
// statically analyzable. That declaration is still true: a rule conflict, a
// precedence conflict, an over-constraint, a redundancy, an overloaded
// context, an authority leak, a model drift and an ambiguous skill routing
// are semantic properties, and no static analysis proves them.
//
// What static analysis can do is narrower and still useful: it can point at
// the candidate occurrences, deterministically, with the evidence attached.
// A candidate is not a verdict. Every signal this module produces is
// therefore advisory: the finding carries `determinism: semantic_advisory`,
// it never gates, it never mutates, and the owner decides whether the
// candidate is a real defect.
//
// The detectors are conservative by construction. Each one fires on a
// lexical or structural fact that is reproducible from the audited tree, not
// on an interpretation of the text. A detector that cannot decide stays
// silent; silence is reported as the declared limitation of the class.
import fs from 'node:fs';
import path from 'node:path';

export const ADVISORY_SIGNAL_VERSION = '1.0.0';

// Authority order used where a signal compares two sources. Higher means
// stronger claim. The order mirrors the inventory classification: the root
// governance and its contracts outrank the shared core, which outranks the
// exported and the repository-local instruction surfaces.
const AUTHORITY_RANK = {
  canonical: 5,
  canonical_contract: 4,
  shared_core: 3,
  shared_exported_skill: 2,
  repo_local: 1
};

const NORMATIVE_PATTERN = /\b(must not|must|never|always|shall|should|do not|don't|required to|forbidden|prohibited|may not|only)\b/i;
const PROHIBITION_PATTERN = /\b(must not|never|do not|don't|forbidden|prohibited|not allowed|no longer)\b/i;
const OBLIGATION_PATTERN = /\b(must|always|shall|required to|is required|needs to|have to)\b/i;
const UNIVERSAL_PATTERN = /\b(all|any|every|always|globally|anywhere|everywhere|repository-wide|across the repo)\b/i;
const SCOPE_QUALIFIER_PATTERN = /\b(in|within|inside|for|under|except|only|outside|per|when|if|unless|after|before)\s+[`'"]?[A-Za-z0-9_./-]+/;
const PERMISSION_PATTERN = /\b(you may|you are authorized|is authorized to|grants? (?:you|the agent|the assistant) permission|you have permission|bypass (?:the )?approval|skip (?:the )?approval|without approval|no approval (?:is )?required|without owner approval)\b/i;
// Model drift is a behaviour assumption, not the mention of a model or a
// client. "Portability across Qwen, GPT and Claude" is the opposite of a
// drift risk: it binds to no model. What drifts is an instruction that
// asserts what a model does or what a context can hold.
const MODEL_PATTERN = /\b(the model (?:will|can|must|always|never|understands|remembers|knows)|model context window|context window (?:is|of|holds|limit)|token limit (?:is|of)|within (?:the )?context window|fits (?:in|into) the context)\b/i;
// A binding of a dotted key to a value, written as an assignment
// (`key = value`, `key: value`) or as a rule in prose (`key must be value`,
// `key is value`).
const KEY_VALUE_PATTERN = /\b([a-z][a-z0-9_]*(?:\.[a-z0-9_.-]+)+)["'`]*\s*(?:=|:|\b(?:must be|must equal|shall be|equals|is)\b)\s*([^\s`"',;]+)/i;
const SUBJECT_PATTERN = /`([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`/;

// A line qualifies as an instruction when it states a rule. Short fragments
// and headings are excluded: they cannot carry a rule and they produce
// noise in every comparison.
const MIN_INSTRUCTION_LENGTH = 20;

const SKILL_ROLES = new Set([
  'portable_skill_instruction',
  'shared_exported_skill_instruction',
  'local_skill_instruction'
]);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'then',
  'they', 'their', 'them', 'are', 'was', 'were', 'has', 'have', 'had', 'not',
  'but', 'any', 'all', 'can', 'will', 'shall', 'must', 'should', 'may', 'its',
  'before', 'after', 'under', 'over', 'per', 'via', 'using', 'use', 'used'
]);

// The instruction lines of one source file, with the facts every detector
// needs. Code fences are skipped: a rule quoted inside a code block is an
// example, not an instruction of the repository.
//
// `normativeOnly` decides whether a line has to state a rule. Most detectors
// compare rules, so they read the normative lines. Two detectors read every
// line instead: a permission claim and a model-behaviour assumption are
// claims wherever they stand, and neither needs a modal verb to be one.
export function instructionLines(root, source, { normativeOnly = true } = {}) {
  let content;
  try {
    content = fs.readFileSync(path.join(root, source.path), 'utf8');
  } catch {
    return [];
  }
  const lines = [];
  let inFence = false;
  content.split('\n').forEach((raw, index) => {
    const text = raw.trim();
    if (text.startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (text.length === 0 || text.startsWith('#')) return;
    if (text.length < MIN_INSTRUCTION_LENGTH) return;
    if (normativeOnly && !NORMATIVE_PATTERN.test(text)) return;
    lines.push({
      path: source.path,
      role: source.role,
      authority_class: source.authority_class,
      authority_rank: AUTHORITY_RANK[source.authority_class] ?? 0,
      line: index + 1,
      text,
      normalized: normalizeInstruction(text)
    });
  });
  return lines;
}

// The comparable form of an instruction: lower case, collapsed whitespace,
// no trailing punctuation. Two instructions with the same normalized form
// state the same rule.
export function normalizeInstruction(text) {
  return text
    .toLowerCase()
    .replace(/[`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

function signal({ findingClass, sourcePath, line, authorityClass, observedProblem, evidenceRefs, riskLevel, confidence, recommendedAction }) {
  return {
    finding_class: findingClass,
    source_path: sourcePath,
    line,
    authority_class: authorityClass,
    observed_problem: observedProblem,
    evidence_refs: evidenceRefs,
    risk_level: riskLevel,
    confidence,
    recommended_action: recommendedAction
  };
}

// Two rules that bind the same key to different values. The key is a dotted
// configuration key, the binding is explicit, and the values differ.
export function ruleConflictSignals(lines) {
  const byKey = new Map();
  for (const entry of lines) {
    const match = entry.text.match(KEY_VALUE_PATTERN);
    if (!match) continue;
    const [, key, value] = match;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ ...entry, value });
  }
  const signals = [];
  for (const [key, entries] of [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const values = [...new Set(entries.map((entry) => entry.value))];
    if (values.length < 2) continue;
    const distinctSources = new Set(entries.map((entry) => entry.path));
    if (distinctSources.size < 2) continue;
    const first = entries[0];
    signals.push(signal({
      findingClass: 'RULE_CONFLICT',
      sourcePath: first.path,
      line: first.line,
      authorityClass: first.authority_class,
      observedProblem: `the key \`${key}\` is bound to ${values.length} different values (${values.join(', ')}) across ${distinctSources.size} instruction sources`,
      evidenceRefs: entries.map((entry) => `key:${key}@${entry.path}#L${entry.line}:${entry.value}`),
      riskLevel: 'high',
      confidence: 'medium',
      recommendedAction: `decide which binding of \`${key}\` is authoritative and align the other sources to it (owner decision; the auditor never edits an instruction source)`
    }));
  }
  return signals;
}

// The same subject governed in opposite directions by sources of different
// authority. The subject is the referenced file or key the rule talks about.
export function precedenceConflictSignals(lines) {
  const bySubject = new Map();
  for (const entry of lines) {
    const subjectMatch = entry.text.match(SUBJECT_PATTERN);
    const keyMatch = entry.text.match(KEY_VALUE_PATTERN);
    const subject = subjectMatch ? subjectMatch[1] : keyMatch ? keyMatch[1] : null;
    if (!subject) continue;
    const prohibition = PROHIBITION_PATTERN.test(entry.text);
    const obligation = OBLIGATION_PATTERN.test(entry.text);
    if (prohibition === obligation) continue;
    const polarity = prohibition ? 'prohibition' : 'obligation';
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject).push({ ...entry, polarity });
  }
  const signals = [];
  for (const [subject, entries] of [...bySubject.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const prohibitions = entries.filter((entry) => entry.polarity === 'prohibition');
    const obligations = entries.filter((entry) => entry.polarity === 'obligation');
    if (prohibitions.length === 0 || obligations.length === 0) continue;
    const ranks = new Set(entries.map((entry) => entry.authority_rank));
    if (ranks.size < 2) continue;
    const first = entries[0];
    signals.push(signal({
      findingClass: 'PRECEDENCE_CONFLICT',
      sourcePath: first.path,
      line: first.line,
      authorityClass: first.authority_class,
      observedProblem: `\`${subject}\` is governed in opposite directions (${prohibitions.length} prohibition(s), ${obligations.length} obligation(s)) by instruction sources of different authority`,
      evidenceRefs: entries.map((entry) => `polarity:${entry.polarity}@${entry.path}#L${entry.line}:${entry.authority_class}`),
      riskLevel: 'high',
      confidence: 'medium',
      recommendedAction: `state which authority governs \`${subject}\` and align the other source to it (owner decision; the auditor never edits an instruction source)`
    }));
  }
  return signals;
}

// A prohibition that reaches beyond any scope: it quantifies over everything
// and names no boundary it stops at.
//
// The quantifier is only read inside the clause that carries the
// prohibition. A long line can hold several clauses, and the scope of a
// prohibition is the clause it states - not the line it happens to sit on.
export function overconstraintSignals(lines) {
  const signals = [];
  for (const entry of lines) {
    const prohibition = entry.text.match(PROHIBITION_PATTERN);
    if (!prohibition) continue;
    const clause = entry.text
      .split(/[;|]|\.\s+/)
      .find((part) => PROHIBITION_PATTERN.test(part))
      ?.trim();
    if (!clause) continue;
    if (!UNIVERSAL_PATTERN.test(clause)) continue;
    if (SCOPE_QUALIFIER_PATTERN.test(clause)) continue;
    signals.push(signal({
      findingClass: 'OVERCONSTRAINT',
      sourcePath: entry.path,
      line: entry.line,
      authorityClass: entry.authority_class,
      observedProblem: `the prohibition quantifies over everything ("${clause.slice(0, 120)}") without a scope it stops at`,
      evidenceRefs: [`line:${entry.path}#L${entry.line}`],
      riskLevel: 'medium',
      confidence: 'low',
      recommendedAction: `name the scope this rule is meant to cover, or narrow the quantification (owner decision; the auditor never edits an instruction source)`
    }));
  }
  return signals;
}

// The same rule stated in more than one source. The repetition is the
// signal; whether the repetition carries an independent function is the
// owner's judgement.
export function redundantInstructionSignals(lines) {
  const byText = new Map();
  for (const entry of lines) {
    if (entry.normalized.length < 40) continue;
    if (!byText.has(entry.normalized)) byText.set(entry.normalized, []);
    byText.get(entry.normalized).push(entry);
  }
  const signals = [];
  for (const [normalized, entries] of [...byText.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sources = new Set(entries.map((entry) => entry.path));
    if (sources.size < 2) continue;
    const first = entries[0];
    signals.push(signal({
      findingClass: 'REDUNDANT_INSTRUCTION',
      sourcePath: first.path,
      line: first.line,
      authorityClass: first.authority_class,
      observedProblem: `the same instruction is stated in ${sources.size} sources (${[...sources].sort().join(', ')}): "${normalized.slice(0, 100)}"`,
      evidenceRefs: entries.map((entry) => `instruction:${entry.path}#L${entry.line}`),
      riskLevel: 'low',
      confidence: 'medium',
      recommendedAction: `keep the rule in one authoritative source and point the others at it, if the repetition has no independent function (owner decision; the auditor never edits an instruction source)`
    }));
  }
  return signals;
}

// Context that is loaded without adding anything: a source whose every
// instruction is already stated by a source of higher authority. The class
// definition of the spec is "irrelevant context is loaded", and this is the
// statically decidable shape of it.
export function contextOverloadSignals(lines, sources) {
  const byText = new Map();
  for (const entry of lines) {
    if (!byText.has(entry.normalized)) byText.set(entry.normalized, []);
    byText.get(entry.normalized).push(entry);
  }
  const linesByPath = new Map();
  for (const entry of lines) {
    if (!linesByPath.has(entry.path)) linesByPath.set(entry.path, []);
    linesByPath.get(entry.path).push(entry);
  }
  const signals = [];
  for (const source of sources) {
    const own = linesByPath.get(source.path) ?? [];
    if (own.length === 0) continue;
    let subsumed = 0;
    for (const entry of own) {
      const others = (byText.get(entry.normalized) ?? []).filter(
        (candidate) => candidate.path !== entry.path && candidate.authority_rank > entry.authority_rank
      );
      if (others.length > 0) subsumed += 1;
    }
    if (subsumed !== own.length) continue;
    const first = own[0];
    signals.push(signal({
      findingClass: 'CONTEXT_OVERLOAD',
      sourcePath: source.path,
      line: first.line,
      authorityClass: source.authority_class,
      observedProblem: `every instruction of this source (${own.length}) is already stated by a source of higher authority, so loading it adds no independent instruction`,
      evidenceRefs: own.map((entry) => `instruction:${entry.path}#L${entry.line}`),
      riskLevel: 'medium',
      confidence: 'medium',
      recommendedAction: `decide whether this source is loaded at all, or reduce it to what it adds beyond the higher-authority source (owner decision; the auditor never edits an instruction source)`
    }));
  }
  return signals;
}

// A source below the canonical authority classes that claims a permission.
// The claim is not proven here; it is pointed at.
export function authorityLeakSignals(lines) {
  const signals = [];
  for (const entry of lines) {
    if (entry.authority_class === 'canonical' || entry.authority_class === 'canonical_contract') continue;
    if (!PERMISSION_PATTERN.test(entry.text)) continue;
    signals.push(signal({
      findingClass: 'AUTHORITY_LEAK',
      sourcePath: entry.path,
      line: entry.line,
      authorityClass: entry.authority_class,
      observedProblem: `a source of authority class \`${entry.authority_class}\` claims a permission ("${entry.text.slice(0, 120)}")`,
      evidenceRefs: [`line:${entry.path}#L${entry.line}:${entry.authority_class}`],
      riskLevel: 'high',
      confidence: 'medium',
      recommendedAction: `check whether this source may grant a permission at all; permissions belong to the canonical authority classes (owner decision; the auditor never edits an instruction source)`
    }));
  }
  return signals;
}

// An instruction whose behaviour depends on a model or on a model property.
// After a model change the instruction means something else, and nothing in
// the tree says so.
export function modelDriftSignals(lines) {
  const signals = [];
  for (const entry of lines) {
    if (!MODEL_PATTERN.test(entry.text)) continue;
    signals.push(signal({
      findingClass: 'MODEL_DRIFT',
      sourcePath: entry.path,
      line: entry.line,
      authorityClass: entry.authority_class,
      observedProblem: `the instruction depends on a model or a model property ("${entry.text.slice(0, 120)}")`,
      evidenceRefs: [`line:${entry.path}#L${entry.line}`],
      riskLevel: 'medium',
      confidence: 'low',
      recommendedAction: `state the behaviour without assuming a specific model, or bind the instruction to the qualified executor profile (owner decision; the auditor never edits an instruction source)`
    }));
  }
  return signals;
}

// Two skills whose descriptions claim the same ground. The selection is
// ambiguous for a task that matches both; which one wins is decided by the
// router, not by the description.
export function skillRoutingAmbiguitySignals(root, sources) {
  const skills = [];
  for (const source of sources) {
    if (!SKILL_ROLES.has(source.role)) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(root, source.path), 'utf8');
    } catch {
      continue;
    }
    const description = content.match(/^description:\s*(.+)$/m);
    if (!description) continue;
    const tokens = [...new Set(
      description[1]
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
    )].sort();
    if (tokens.length === 0) continue;
    skills.push({ path: source.path, role: source.role, authority_class: source.authority_class, tokens });
  }
  const signals = [];
  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const left = skills[i];
      const right = skills[j];
      if (left.path === right.path) continue;
      const shared = left.tokens.filter((token) => right.tokens.includes(token));
      // Two descriptions share terms in every corpus. The signal only carries
      // meaning when the shared terms cover most of the shorter description:
      // a router that cannot tell them apart is ambiguous, and a pair that
      // shares two generic words is not.
      const coverage = shared.length / Math.min(left.tokens.length, right.tokens.length);
      if (shared.length < 3 || coverage < 0.5) continue;
      const first = left;
      signals.push(signal({
        findingClass: 'SKILL_ROUTING_AMBIGUITY',
        sourcePath: first.path,
        line: 1,
        authorityClass: first.authority_class,
        observedProblem: `the descriptions of ${left.path} and ${right.path} claim the same ground (${Math.round(coverage * 100)}% of the shorter description, shared terms: ${shared.join(', ')})`,
        evidenceRefs: [`skill:${left.path}`, `skill:${right.path}`],
        riskLevel: 'medium',
        confidence: 'low',
        recommendedAction: `make the two descriptions distinguishable, or state which skill wins for a task that matches both (owner decision; the auditor never edits an instruction source)`
      }));
    }
  }
  return signals;
}

// collectAdvisorySignals({ root, graph }) ->
//   { schema_version, signals, by_class, counts }
// The signals of one run are ordered deterministically, so two audits of the
// same tree produce the same list.
export function collectAdvisorySignals({ root, graph }) {
  const sources = graph.nodes.map((node) => ({
    path: node.path,
    role: node.role,
    authority_class: node.authority_class
  }));
  const lines = sources.flatMap((source) => instructionLines(root, source));
  // A permission claim and a model-behaviour assumption are claims wherever
  // they stand; they are read from every line, not only from the lines that
  // happen to state a rule.
  const claims = sources.flatMap((source) => instructionLines(root, source, { normativeOnly: false }));
  const signals = [
    ...ruleConflictSignals(lines),
    ...precedenceConflictSignals(lines),
    ...overconstraintSignals(lines),
    ...redundantInstructionSignals(lines),
    ...contextOverloadSignals(lines, sources),
    ...authorityLeakSignals(claims),
    ...modelDriftSignals(claims),
    ...skillRoutingAmbiguitySignals(root, sources)
  ];
  signals.sort((a, b) => {
    if (a.source_path !== b.source_path) return a.source_path < b.source_path ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.finding_class !== b.finding_class) return a.finding_class < b.finding_class ? -1 : 1;
    return a.observed_problem < b.observed_problem ? -1 : a.observed_problem > b.observed_problem ? 1 : 0;
  });
  const byClass = {};
  for (const entry of signals) {
    byClass[entry.finding_class] = (byClass[entry.finding_class] ?? 0) + 1;
  }
  return {
    schema_version: ADVISORY_SIGNAL_VERSION,
    signals,
    by_class: byClass,
    counts: { signal_count: signals.length }
  };
}
