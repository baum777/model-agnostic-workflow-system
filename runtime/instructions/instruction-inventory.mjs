// MAWS vNext — S2 wave 1 instruction inventory (MAWS-SII-TARGET-SPEC-001,
// PROPOSED). Read-only, deterministic inventory of the canonical instruction
// sources: a declared fixed source set plus the enumerated skill instruction
// files under core/skills/ and .agents/skills/. Every source is bound to its
// byte content via sha256; the caller binds the repository revision. The
// module never writes to the filesystem and never spawns a process. The
// inventory is analysis input, not authority: it neither grants permissions
// nor activates or promotes any surface.
import fs from 'node:fs';
import path from 'node:path';
import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';

export const INVENTORY_SCHEMA_VERSION = '1.0.0';

// Declared non-skill instruction sources. Paths are repo-relative posix paths.
const FIXED_SOURCES = [
  { path: 'AGENTS.md', role: 'root_governance', authority_class: 'canonical' },
  { path: 'WORKFLOW.md', role: 'workflow_contract', authority_class: 'canonical' },
  { path: 'docs/governance/source-hierarchy.md', role: 'authority_hierarchy', authority_class: 'canonical' },
  { path: 'docs/authority-matrix.md', role: 'authority_matrix', authority_class: 'canonical' },
  { path: 'docs/model-agnostic-core-prompt-system.md', role: 'core_prompt_architecture', authority_class: 'canonical' },
  { path: 'core/contracts/workflow-routing-map.json', role: 'workflow_routing_contract', authority_class: 'canonical_contract' },
  { path: 'core/contracts/permission-boundary.json', role: 'permission_boundary_contract', authority_class: 'canonical_contract' },
  { path: 'core/contracts/workflow-memory-contract.json', role: 'workflow_memory_contract', authority_class: 'canonical_contract' }
];

// Enumerated skill instruction trees. A skill instruction file is SKILL.md or
// a top-level *.skill.yaml inside an immediate subdirectory.
const SKILL_TREES = [
  { dir: 'core/skills', role: 'portable_skill_instruction', authority_class: 'shared_core' },
  { dir: '.agents/skills', role: 'local_skill_instruction', authority_class: 'repo_local' }
];

function isSkillInstructionFile(name) {
  return name === 'SKILL.md' || name.endsWith('.skill.yaml');
}

function requireFile(absPath, repoPath) {
  let stats;
  try {
    stats = fs.statSync(absPath);
  } catch {
    throw new FailClosedError('INSTRUCTION_SOURCE_MISSING', `declared instruction source not readable: ${repoPath}`);
  }
  if (!stats.isFile()) {
    throw new FailClosedError('INSTRUCTION_SOURCE_NOT_A_FILE', `declared instruction source is not a file: ${repoPath}`);
  }
}

// Enumerate the declared source set (paths, roles, authority classes) without
// reading file contents. Fails closed on any missing declared source.
export function listInstructionSources(root) {
  const sources = [];
  for (const spec of FIXED_SOURCES) {
    requireFile(path.join(root, spec.path), spec.path);
    sources.push({ path: spec.path, role: spec.role, authority_class: spec.authority_class });
  }
  for (const tree of SKILL_TREES) {
    const absDir = path.join(root, tree.dir);
    if (!fs.existsSync(absDir)) {
      throw new FailClosedError('INSTRUCTION_SOURCE_DIR_MISSING', `declared skill tree not readable: ${tree.dir}`);
    }
    for (const entry of fs.readdirSync(absDir).sort()) {
      const absEntry = path.join(absDir, entry);
      if (!fs.statSync(absEntry).isDirectory()) continue;
      for (const name of fs.readdirSync(absEntry).sort()) {
        if (!isSkillInstructionFile(name)) continue;
        const repoPath = `${tree.dir}/${entry}/${name}`;
        requireFile(absEntry + path.sep + name, repoPath);
        sources.push({ path: repoPath, role: tree.role, authority_class: tree.authority_class });
      }
    }
  }
  return sources;
}

// buildInstructionInventory({ root, revision }) ->
//   { schema_version, revision, source_count, sources: [{path, role,
//    authority_class, sha256, bytes}], digest }
// The digest binds the revision and the content digests of all sources in
// canonical order; it excludes byte counts (already covered by sha256) so the
// same tree + revision always yields the same digest.
export function buildInstructionInventory({ root, revision }) {
  if (typeof revision !== 'string' || revision.length < 1) {
    throw new FailClosedError('INVENTORY_REVISION_REQUIRED', 'revision is required: an inventory without a revision binding cannot be reconstructed later');
  }
  const declared = listInstructionSources(root);
  const sources = declared.map((spec) => {
    const abs = path.join(root, spec.path);
    const content = fs.readFileSync(abs, 'utf8');
    return {
      path: spec.path,
      role: spec.role,
      authority_class: spec.authority_class,
      sha256: sha256Hex(content),
      bytes: Buffer.byteLength(content, 'utf8')
    };
  });
  const digest = sha256Hex(
    canonicalJson({
      revision,
      sources: sources.map(({ sha256, path, role, authority_class }) => ({ path, role, authority_class, sha256 }))
    })
  );
  return {
    schema_version: INVENTORY_SCHEMA_VERSION,
    revision,
    source_count: sources.length,
    sources,
    digest
  };
}
