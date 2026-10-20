// MAWS vNext — S2 wave 2 instruction reference graph (MAWS-SII-TARGET-SPEC-001,
// PROPOSED). Read-only, deterministic reference extraction and resolution over
// the canonical instruction source set from the wave 1 inventory. Extraction
// uses a closed rule set — markdown links, repo-path-shaped code spans, and
// `npm run <script>` code spans — so every edge is reproducible; the graph
// records dangling references as data (resolution status) and never mutates
// anything: no writes, no process spawn. The graph is analysis input for the
// S3 auditor, not authority: it neither grants permissions nor activates,
// promotes, or reclassifies any surface.
import fs from 'node:fs';
import path from 'node:path';
import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { INVENTORY_SCHEMA_VERSION, buildInstructionInventory } from './instruction-inventory.mjs';

export const GRAPH_SCHEMA_VERSION = '1.0.0';

// Link targets that are web/anchor references, not instruction file
// references. Pure fragments (#...) are skipped entirely.
const EXTERNAL_TARGET = /^(https?:|mailto:|data:)/i;

function isExternalTarget(target) {
  return EXTERNAL_TARGET.test(target) || target.startsWith('#');
}

// A code span counts as a path-shaped reference only under all of: no
// whitespace, contains a path separator, ends in a file extension, no
// assignment or variable syntax. This keeps commands like `npm run test`
// and placeholders like `<model>` out of the file-reference class.
function isPathShapedSpan(span) {
  if (/\s/.test(span)) return false;
  if (!span.includes('/')) return false;
  if (!/\.[A-Za-z0-9]{1,8}$/.test(span)) return false;
  if (span.includes('=') || span.includes('$') || span.startsWith('<')) return false;
  return true;
}

// A path-shaped reference that names a pattern rather than a file. Glob
// patterns are workspace selection rules, not file references: they have no
// single resolvable target and their absence from the repository is not a
// defect.
const WILDCARD = /[*?[\]{}]/;

// A revision range. `origin/main..main` names two revisions, not a file; it
// is a git expression whose apparent file extension (".main") is an accident
// of the revision name. A relative path such as `../../AGENTS.md` also
// contains "..", so the range form is recognized by its right-hand side
// being a revision name rather than a path: no separator and no file
// extension.
function isGitRange(target) {
  if (!target.includes('..')) return false;
  if (target.startsWith('../')) return false;
  const right = target.slice(target.lastIndexOf('..') + 2);
  if (right.length === 0) return false;
  if (right.includes('/')) return false;
  if (/\.[A-Za-z0-9]{1,8}$/.test(right)) return false;
  return true;
}

// Documented absences. A reference that the source explicitly states does not
// exist is a recorded finding about the repository, not a broken reference.
const ABSENCE_STATEMENT = [
  /\bnot present\b/i,
  /\bdoes not exist\b/i,
  /\bdoesn't exist\b/i,
  /\bnot exist\b/i,
  /\bdoes not appear\b/i,
  /\bnot found\b/i,
  /\bnicht vorhanden\b/i,
  /\bnicht existierend\b/i
];

// Consumer-local and workspace-local contract directories. These paths are
// declared by the consumer repository (`.codex/`, `.qwen/`) or by the
// workspace a skill operates on (`supabase/`), not by this repository: their
// absence here is by design and their presence is not this repository's
// business.
const NON_REPOSITORY_PATH_PREFIXES = ['.codex/', '.qwen/', 'supabase/'];

function isGlobPattern(target) {
  return WILDCARD.test(target);
}

function statesAbsence(lineText) {
  return ABSENCE_STATEMENT.some((pattern) => pattern.test(lineText));
}

function isNonRepositoryPath(target) {
  return NON_REPOSITORY_PATH_PREFIXES.some((prefix) => target.startsWith(prefix));
}

// Extract references from one source file body. Returns edges relative to
// `sourcePath` (repo-relative posix), one per match, with 1-based line
// numbers. Duplicate (kind, target, line) triples are collapsed.
function extractEdges(sourcePath, content) {
  const lines = content.split('\n');
  const edges = [];
  const seen = new Set();
  const push = (edge) => {
    const key = `${edge.kind}\u0000${edge.target}\u0000${edge.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    for (const match of line.matchAll(/\[[^\]\n]*\]\(([^)\n]*)\)/g)) {
      const target = match[1];
      if (target.length === 0 || isExternalTarget(target)) continue;
      push({ kind: 'md_link', target, line: lineNo, line_text: line });
    }
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const span = match[1];
      const commandMatch = span.match(/^npm run ([A-Za-z0-9:_.-]+)$/);
      if (commandMatch) {
        push({ kind: 'npm_run_command', target: commandMatch[1], line: lineNo, line_text: line });
        continue;
      }
      if (isPathShapedSpan(span)) {
        push({ kind: 'inline_path', target: span, line: lineNo, line_text: line });
      }
    }
  });
  return edges;
}

// Resolve one extracted file edge against the repo tree. Fragments are
// stripped before resolution.
//
// Resolution is tried against two bases, in order: relative to the
// referencing document's own directory, then relative to the repository
// root. A skill that points at `references/style-selection-map.md` means the
// file next to it; a governance document that points at
// `core/skills/repo-audit/SKILL.md` means the repository path. Both are
// legitimate instruction conventions, and resolving only one of them
// produced false dangling references in both directions.
//
// A reference that names no resolvable file is classified, not collapsed into
// one bucket. Five classes exist, and only the last one is a defect:
//
//   resolved              — the target exists in this repository
//   glob_pattern          — the target names a selection pattern, not a file
//   git_range             — the target names a revision range, not a file
//   documented_absence    — the source states that the target does not exist
//   external_workspace    — the target belongs to a consumer or workspace
//   dangling              — the target should exist here and does not
//
// The middle four are recorded in the graph with their own status, so the
// auditor can report them without claiming a defect, and so the counts stay
// visible instead of being silently dropped.
function resolveFileEdge(root, sourcePath, target, base, lineText) {
  const fragmentIndex = target.indexOf('#');
  const fileTarget = fragmentIndex >= 0 ? target.slice(0, fragmentIndex) : target;
  if (fileTarget.length === 0) return { resolved: null, status: 'dangling' };
  if (isGlobPattern(fileTarget)) return { resolved: null, status: 'glob_pattern' };
  if (isGitRange(fileTarget)) return { resolved: null, status: 'git_range' };
  if (statesAbsence(lineText ?? '')) return { resolved: null, status: 'documented_absence' };
  if (isNonRepositoryPath(fileTarget)) return { resolved: null, status: 'external_workspace' };
  if (fileTarget.startsWith('/')) {
    const rooted = fileTarget.slice(1);
    return fs.existsSync(path.join(root, rooted))
      ? { resolved: rooted, status: 'resolved' }
      : { resolved: null, status: 'dangling' };
  }
  const baseDirs = base === 'root'
    ? [path.posix.dirname(sourcePath), '.']
    : [path.posix.dirname(sourcePath)];
  for (const baseDir of baseDirs) {
    const joined = path.posix.normalize(path.posix.join(baseDir, fileTarget));
    if (joined.startsWith('..')) continue;
    if (fs.existsSync(path.join(root, joined))) {
      return { resolved: joined, status: 'resolved' };
    }
  }
  return { resolved: null, status: 'dangling' };
}

function readPackageScripts(root) {
  const abs = path.join(root, 'package.json');
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    throw new FailClosedError(
      'INSTRUCTION_PACKAGE_MANIFEST_MISSING',
      'command references were extracted but package.json is not readable: referenced scripts cannot be verified'
    );
  }
  const parsed = JSON.parse(content);
  return parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
}

// buildInstructionGraph({ root, revision }) ->
//   { schema_version, revision, inventory_schema_version, node_count,
//     edge_count, nodes, edges, dangling_count, status_counts, digest }
// Nodes are the inventory sources (path, role, authority_class, sha256).
// Edges carry {from, kind, target, line, resolved, status}; command edges
// resolve against the root package.json scripts map. The digest binds the
// revision and every node and edge in canonical order.
export function buildInstructionGraph({ root, revision }) {
  const inventory = buildInstructionInventory({ root, revision });
  const nodes = inventory.sources.map(({ path: sourcePath, role, authority_class, sha256 }) => ({
    path: sourcePath,
    role,
    authority_class,
    sha256
  }));

  let packageScripts = null;
  const edges = [];
  for (const node of nodes) {
    const content = fs.readFileSync(path.join(root, node.path), 'utf8');
    for (const edge of extractEdges(node.path, content)) {
      const { line_text: lineText, ...rest } = edge;
      if (edge.kind === 'npm_run_command') {
        if (packageScripts === null) packageScripts = readPackageScripts(root);
        const resolved = Object.prototype.hasOwnProperty.call(packageScripts, edge.target);
        edges.push({ from: node.path, ...rest, resolved: resolved ? edge.target : null, status: resolved ? 'resolved' : 'dangling' });
      } else {
        const base = edge.kind === 'inline_path' ? 'root' : 'source_dir';
        const { resolved, status } = resolveFileEdge(root, node.path, edge.target, base, lineText);
        edges.push({ from: node.path, ...rest, resolved, status });
      }
    }
  }
  edges.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.target < b.target ? -1 : a.target > b.target ? 1 : 0;
  });

  const digest = sha256Hex(canonicalJson({ revision, nodes, edges }));
  const statusCounts = { resolved: 0, glob_pattern: 0, git_range: 0, documented_absence: 0, external_workspace: 0, dangling: 0 };
  for (const edge of edges) {
    if (Object.prototype.hasOwnProperty.call(statusCounts, edge.status)) statusCounts[edge.status] += 1;
  }
  return {
    schema_version: GRAPH_SCHEMA_VERSION,
    inventory_schema_version: INVENTORY_SCHEMA_VERSION,
    revision,
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    dangling_count: statusCounts.dangling,
    status_counts: statusCounts,
    digest
  };
}
