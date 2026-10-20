// MAWS vNext — S3 instruction auditor (MAWS-SII-TARGET-SPEC-001, PROPOSED).
// Read-only, deterministic audit over the S2 reference graph. Wave 1 of the
// auditor implements the two statically decidable classes of the section 6.2
// taxonomy — STALE_REFERENCE and INVALID_COMMAND — and honestly declares the
// remaining eight classes as not statically analyzable instead of emitting
// heuristic guesses. Findings are analysis output: they never mutate files,
// never spawn processes, never gate, and replace no authority or approval
// decision (spec section 6.5); deterministically proven integrity errors may
// only gate via existing gate policy owned elsewhere.
import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { buildInstructionGraph } from './instruction-resolver.mjs';

export const AUDIT_SCHEMA_VERSION = '1.0.0';

// Closed audit taxonomy (spec section 6.2) with per-class static
// decidability. `analyzable_static: true` classes are audited in wave 1;
// the rest are declared in the audit coverage so absence of findings for
// them is an explicit limitation, never a silent clean bill.
export const AUDIT_TAXONOMY = [
  { finding_class: 'STALE_REFERENCE', definition: 'referenced file, import or reference does not exist', analyzable_static: true },
  { finding_class: 'INVALID_COMMAND', definition: 'referenced command is not available', analyzable_static: true },
  { finding_class: 'RULE_CONFLICT', definition: 'two relevant rules are logically incompatible', analyzable_static: false },
  { finding_class: 'PRECEDENCE_CONFLICT', definition: 'contradiction between authority levels', analyzable_static: false },
  { finding_class: 'OVERCONSTRAINT', definition: 'rule is broader than its necessary scope', analyzable_static: false },
  { finding_class: 'REDUNDANT_INSTRUCTION', definition: 'repetition without independent function', analyzable_static: false },
  { finding_class: 'CONTEXT_OVERLOAD', definition: 'irrelevant context is loaded', analyzable_static: false },
  { finding_class: 'AUTHORITY_LEAK', definition: 'instruction claims a permission that does not exist', analyzable_static: false },
  { finding_class: 'MODEL_DRIFT', definition: 'instruction behavior changes after a model change', analyzable_static: false },
  { finding_class: 'SKILL_ROUTING_AMBIGUITY', definition: 'skill selection is ambiguous or imprecise', analyzable_static: false }
];

const RISK_BY_CLASS = { STALE_REFERENCE: 'high', INVALID_COMMAND: 'medium' };

function requireFindingClass(findingClass) {
  if (!AUDIT_TAXONOMY.some((entry) => entry.finding_class === findingClass)) {
    throw new FailClosedError('AUDIT_CLASS_UNKNOWN', `finding class outside the closed section 6.2 taxonomy: ${findingClass}`);
  }
}

function buildFinding({ auditId, graphDigest, findingClass, edge, authorityClass }) {
  requireFindingClass(findingClass);
  const findingId = `iaf_${sha256Hex(canonicalJson({ audit_id: auditId, finding_class: findingClass, from: edge.from, line: edge.line, target: edge.target })).slice(0, 16)}`;
  return {
    schema_version: AUDIT_SCHEMA_VERSION,
    audit_id: auditId,
    finding_id: findingId,
    finding_class: findingClass,
    determinism: 'deterministic',
    source_path: edge.from,
    source_revision: edge.revision,
    line_range: [edge.line, edge.line],
    authority_class: authorityClass,
    observed_problem:
      edge.kind === 'npm_run_command'
        ? `command reference \`npm run ${edge.target}\` does not resolve to a declared package.json script`
        : `reference \`${edge.target}\` (${edge.kind}) does not resolve to an existing file`,
    evidence_refs: [`graph:${graphDigest}`, `edge:${edge.from}#L${edge.line}:${edge.kind}:${edge.target}`],
    inferred_cause: null,
    risk_level: RISK_BY_CLASS[findingClass],
    confidence: 'high',
    recommended_action:
      edge.kind === 'npm_run_command'
        ? `verify the intended script name and repair or remove the command reference in ${edge.from} (owner action; the auditor is read-only)`
        : `repair or remove the reference in ${edge.from} so it resolves inside the repository (owner action; the auditor is read-only)`,
    requires_owner_review: false
  };
}

// auditInstructionSources({ root, revision }) ->
//   { schema_version, audit_id, revision, graph_digest, source_count,
//     edge_count, findings, findings_count, coverage, digest }
// coverage records exactly which taxonomy classes were analyzed and why the
// remaining ones are declared not statically analyzable in this wave.
export function auditInstructionSources({ root, revision }) {
  const graph = buildInstructionGraph({ root, revision });
  const auditId = `ia_${sha256Hex(canonicalJson({ revision, graph_digest: graph.digest })).slice(0, 16)}`;
  const authorityByPath = new Map(graph.nodes.map((node) => [node.path, node.authority_class]));

  const findings = [];
  for (const edge of graph.edges) {
    if (edge.status !== 'dangling') continue;
    const findingClass = edge.kind === 'npm_run_command' ? 'INVALID_COMMAND' : 'STALE_REFERENCE';
    findings.push(
      buildFinding({
        auditId,
        graphDigest: graph.digest,
        findingClass,
        edge: { ...edge, revision },
        authorityClass: authorityByPath.get(edge.from)
      })
    );
  }
  findings.sort((a, b) => (a.source_path < b.source_path ? -1 : a.source_path > b.source_path ? 1 : a.finding_id < b.finding_id ? -1 : 1));

  const coverage = {
    classes_analyzed: AUDIT_TAXONOMY.filter((entry) => entry.analyzable_static).map((entry) => entry.finding_class),
    classes_declared_not_analyzable: AUDIT_TAXONOMY.filter((entry) => !entry.analyzable_static).map((entry) => ({
      finding_class: entry.finding_class,
      reason: 'not statically analyzable: requires semantic interpretation beyond static reference analysis; an explicit advisory limitation of audit wave 1, not a clean result'
    }))
  };
  const digest = sha256Hex(canonicalJson({ revision, audit_id: auditId, findings, coverage }));
  return {
    schema_version: AUDIT_SCHEMA_VERSION,
    audit_id: auditId,
    revision,
    graph_digest: graph.digest,
    source_count: graph.node_count,
    edge_count: graph.edge_count,
    findings,
    findings_count: findings.length,
    coverage,
    digest
  };
}
