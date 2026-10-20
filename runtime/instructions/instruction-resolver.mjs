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
      push({ kind: 'md_link', target, line: lineNo });
    }
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const span = match[1];
      const commandMatch = span.match(/^npm run ([A-Za-z0-9:_.-]+)$/);
      if (commandMatch) {
        push({ kind: 'npm_run_command', target: commandMatch[1], line: lineNo });
        continue;
      }
      if (isPathShapedSpan(span)) {
        push({ kind: 'inline_path', target: span, line: lineNo });
      }
    }
  });
  return edges;
}

// Resolve one extracted file edge against the repo tree. Markdown links
// resolve document-relative (HTML link semantics); path-shaped code spans
// resolve repository-root-relative (instruction-document convention).
// Fragments are stripped before resolution. A reference that escapes the
// repository root or names a missing path resolves as dangling — recorded as
// data, never an error here.
function resolveFileEdge(root, sourcePath, target, base) {
  const fragmentIndex = target.indexOf('#');
  const fileTarget = fragmentIndex >= 0 ? target.slice(0, fragmentIndex) : target;
  if (fileTarget.length === 0) return { resolved: null, status: 'dangling' };
  const baseDir = base === 'root' ? '.' : path.posix.dirname(sourcePath);
  const joined = fileTarget.startsWith('/')
    ? fileTarget.slice(1)
    : path.posix.normalize(path.posix.join(baseDir, fileTarget));
  if (joined.startsWith('..')) return { resolved: null, status: 'dangling' };
  if (fs.existsSync(path.join(root, joined))) {
    return { resolved: joined, status: 'resolved' };
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
//     edge_count, nodes, edges, dangling_count, digest }
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
      if (edge.kind === 'npm_run_command') {
        if (packageScripts === null) packageScripts = readPackageScripts(root);
        const resolved = Object.prototype.hasOwnProperty.call(packageScripts, edge.target);
        edges.push({ from: node.path, ...edge, resolved: resolved ? edge.target : null, status: resolved ? 'resolved' : 'dangling' });
      } else {
        const base = edge.kind === 'inline_path' ? 'root' : 'source_dir';
        const { resolved, status } = resolveFileEdge(root, node.path, edge.target, base);
        edges.push({ from: node.path, ...edge, resolved, status });
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
  return {
    schema_version: GRAPH_SCHEMA_VERSION,
    inventory_schema_version: INVENTORY_SCHEMA_VERSION,
    revision,
    node_count: nodes.length,
    edge_count: edges.length,
    nodes,
    edges,
    dangling_count: edges.filter((edge) => edge.status === 'dangling').length,
    digest
  };
}
