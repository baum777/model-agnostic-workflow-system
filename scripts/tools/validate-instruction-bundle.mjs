#!/usr/bin/env node
// S6 validator (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S6): validate
// instruction bundles against the canonical contract
// core/contracts/instruction-bundle.schema.json plus the fail-closed
// semantic invariants the minimal JSON schema engine cannot express.
//
// Usage:
//   node scripts/tools/validate-instruction-bundle.mjs                   validate the canonical
//                                                                        fixture (positive + negative
//                                                                        cases must match their labels)
//   node scripts/tools/validate-instruction-bundle.mjs <file.json> ...   validate explicit bundles
//                                                                        (all must be valid)
//
// A bundle is context and behavior input, never a permission token: this
// validator proves record shape and the digest/order/conflict invariants
// only. It grants no permission and changes no qualification state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { computeEffectiveInstructionDigest } from '../../runtime/context/instruction-bundle-assembler.mjs';
import { buildInstructionInventory } from '../../runtime/instructions/instruction-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/instruction-bundle.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'instruction-bundle.contracts.json');

const SLOT_ORDER = ['core', 'workflow_contract', 'overlay', 'skills', 'references', 'evidence'];

/**
 * Fail-closed semantic invariants on top of the JSON schema:
 * - B1: the effective instruction digest must be recomputable from the
 *       bundle's own ordered fields (digest binds contents via digests plus
 *       the defined order).
 * - B2: selected_sources must be in canonical assembly order (slot order per
 *       spec 7.2, then ref) with no duplicate refs.
 * - B3: an execution-eligible bundle must carry at least one binding source
 *       of each canonical authority class (structural mode). With
 *       inventoryVerification ({root, revision}) the check is exact: the S2
 *       inventory is rebuilt at the bundle's source revision and every
 *       canonical binding source must be present with its digest — a bundle
 *       that dropped any binding rule can never pass as executable.
 * - B4: instruction_classes counts must equal the per-slot source counts.
 * - B5: context binding refs are references only - no content payload field
 *       beyond the reference identity.
 */
export function semanticBundleIssues(bundle, inventoryVerification = null) {
  const issues = [];

  if (bundle.effective_instruction_digest !== computeEffectiveInstructionDigest(bundle)) {
    issues.push('B1: effective_instruction_digest does not match the bundle content and order');
  }

  let previous = null;
  const seen = new Set();
  for (const source of bundle.selected_sources) {
    const rank = SLOT_ORDER.indexOf(source.assembly_slot);
    if (rank === -1) {
      issues.push(`B2: unknown assembly_slot ${source.assembly_slot}`);
      continue;
    }
    if (previous) {
      if (rank < previous.rank || (rank === previous.rank && source.ref <= previous.ref)) {
        issues.push('B2: selected_sources are not in canonical assembly order');
        break;
      }
    }
    previous = { rank, ref: source.ref };
    if (seen.has(source.ref)) {
      issues.push(`B2: duplicate source ref ${source.ref}`);
    }
    seen.add(source.ref);
  }

  if (bundle.eligible_for_execution) {
    if (inventoryVerification) {
      let inventory;
      try {
        inventory = buildInstructionInventory({ root: inventoryVerification.root, revision: inventoryVerification.revision });
      } catch (error) {
        issues.push(`B3: the source snapshot named by the eligible bundle cannot be rebuilt (${error.message})`);
        inventory = null;
      }
      if (inventory) {
        const bundleSources = new Map(bundle.selected_sources.map((source) => [source.ref, source]));
        for (const source of inventory.sources) {
          if (!['canonical', 'canonical_contract'].includes(source.authority_class)) {
            continue;
          }
          const retained = bundleSources.get(source.path);
          if (!retained) {
            issues.push(`B3: eligible bundle dropped binding source ${source.path}`);
          } else if (retained.source_digest !== `sha256:${source.sha256}`) {
            issues.push(`B3: binding source ${source.path} digests differ from the source snapshot`);
          } else if (retained.binding_class !== source.authority_class) {
            issues.push(`B3: binding source ${source.path} carries binding_class ${retained.binding_class}, expected ${source.authority_class}`);
          }
        }
      }
    } else {
      for (const bindingClass of ['canonical', 'canonical_contract']) {
        if (!bundle.selected_sources.some((source) => source.binding_class === bindingClass)) {
          issues.push(`B3: eligible bundle carries no ${bindingClass} binding source`);
        }
      }
    }
  }

  for (const [slot, count] of Object.entries(bundle.instruction_classes)) {
    const actual = bundle.selected_sources.filter((source) => source.assembly_slot === slot).length;
    if (actual !== count) {
      issues.push(`B4: instruction_classes.${slot} is ${count}, but ${actual} sources are in that slot`);
    }
  }

  for (const ref of bundle.context_binding_refs) {
    const payloadKeys = Object.keys(ref).filter((key) => !['compiler', 'contract_version', 'compilation_digest', 'realm', 'note'].includes(key));
    if (payloadKeys.length > 0) {
      issues.push(`B5: context binding ref carries non-reference payload keys: ${payloadKeys.join(', ')}`);
    }
  }

  return issues;
}

export function validateInstructionBundle(bundle, root = ROOT, options = {}) {
  const issues = validateInstanceAgainstContract(bundle, SCHEMA_PATH, root);
  if (issues.length === 0 && bundle && typeof bundle === 'object') {
    const inventoryVerification = options.verifyBindingsAgainstInventory
      ? { root: options.inventoryRoot ?? root, revision: bundle.provenance?.source_revision }
      : null;
    issues.push(...semanticBundleIssues(bundle, inventoryVerification));
  }
  return issues;
}

let failures = 0;
let checked = 0;

function reportFailure(message) {
  failures += 1;
  console.error(message);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runCli(process.argv.slice(2));
}

function runCli(args) {
  if (args.length === 0) {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    for (const entry of fixture.cases) {
      checked += 1;
      const issues = validateInstructionBundle(entry.instance, ROOT);
      const failed = issues.length > 0;
      if (failed !== !entry.valid) {
        reportFailure(
          `case ${entry.case_id}: expected ${entry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${issues.join('; ') || '(no issues)'}`
        );
      }
    }
    console.log(`instruction-bundle fixture: ${checked} cases checked, ${failures} unexpected results`);
  } else {
    for (const arg of args) {
      const filePath = path.resolve(arg);
      let bundle;
      try {
        bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (error) {
        reportFailure(`${arg}: cannot read or parse (${error.message})`);
        continue;
      }
      checked += 1;
      const issues = validateInstructionBundle(bundle, ROOT);
      if (issues.length > 0) {
        reportFailure(`${arg}: ${issues.join('; ')}`);
      } else {
        console.log(`${arg}: valid`);
      }
    }
    console.log(`instruction-bundle records: ${checked} checked, ${failures} invalid`);
  }
  process.exit(failures === 0 ? 0 : 1);
}
