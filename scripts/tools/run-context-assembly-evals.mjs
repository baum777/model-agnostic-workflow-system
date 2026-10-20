#!/usr/bin/env node
// S6 eval (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S6, spec 7.1-7.5): certify
// adaptive context assembly over the real repository instruction tree.
//
// Proven properties (deterministic, no credentials):
//   P1 reduction - the reduced candidate selects strictly fewer sources than
//      the full-context baseline (spec 7.1: keep the effective instruction
//      set as small as possible).
//   P2 retention - every canonical/canonical_contract binding source of the
//      baseline appears in the candidate with the same digest (spec 7.3 rule
//      7: context reduction never removes a required binding rule or
//      evidence).
//   P3 eligibility - expected bundles are conflict-free; the
//      missing-required-context scenario blocks fail-closed instead of
//      proceeding with a narrower bundle (spec 7.5).
//   P4 determinism - the same scenario assembles to the same
//      effective_instruction_digest across runs; different selections digest
//      differently.
//
// Exit codes: 0 = all properties proven, 2 = certification failure,
// 3 = configuration error. This eval gates assembly evidence and grants no
// permission, promotes no skill, and replaces no approval decision.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assembleInstructionBundle
} from '../../runtime/context/instruction-bundle-assembler.mjs';
import { buildInstructionInventory } from '../../runtime/instructions/instruction-inventory.mjs';
import { validateInstructionBundle } from './validate-instruction-bundle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CASES_PATH = path.join(ROOT, 'evals', 'context-assembly', 'cases.json');

const ASSEMBLY_EVAL_REVISION = 'workspace-unpinned';

function scenarioSelection(selection, inventorySkillPaths) {
  const skillRefs = selection.skills === 'all_inventory_skills'
    ? inventorySkillPaths
    : selection.skills || [];
  return {
    skillRefs,
    overlayRefs: selection.overlay_refs || [],
    referenceRefs: selection.reference_refs || [],
    evidenceRefs: selection.evidence_refs || []
  };
}

export function evaluateContextAssembly({ casesPath = CASES_PATH, root = ROOT, revision = ASSEMBLY_EVAL_REVISION } = {}) {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const failures = [];
  const assembled = new Map();

  const inventory = buildInstructionInventory({ root, revision });
  const inventorySkillPaths = inventory.sources
    .filter((source) => ['shared_core', 'shared_exported_skill'].includes(source.authority_class))
    .map((source) => source.path);

  const common = {
    root,
    revision,
    taskRef: cases.task_ref,
    workflowClass: cases.workflow_class,
    executorProfileRef: cases.executor_profile_ref,
    assemblyPolicyRef: cases.assembly_policy_ref
  };

  const assembleScenario = (scenario) => {
    const selection = scenarioSelection(scenario.selection, inventorySkillPaths);
    const contextRefs = scenario.context_binding_refs !== undefined ? scenario.context_binding_refs : cases.context_binding_refs;
    return assembleInstructionBundle({
      ...common,
      bundleId: `bundle_${scenario.scenario_id}`,
      selection,
      contextBindingRefs: contextRefs,
      requiredContextDigests: scenario.required_context_digests || []
    });
  };

  for (const scenario of cases.scenarios) {
    const result = assembleScenario(scenario);
    assembled.set(scenario.scenario_id, result);

    if (result.bundle.eligible_for_execution !== scenario.expect.eligible) {
      failures.push(`${scenario.scenario_id}: eligibility ${result.bundle.eligible_for_execution} != expected ${scenario.expect.eligible}`);
    }
    if (result.bundle.conflicts.length !== scenario.expect.conflicts) {
      failures.push(`${scenario.scenario_id}: ${result.bundle.conflicts.length} conflicts != expected ${scenario.expect.conflicts}`);
    }
    if (scenario.expect.conflict_kind && !result.bundle.conflicts.some((conflict) => conflict.kind === scenario.expect.conflict_kind)) {
      failures.push(`${scenario.scenario_id}: expected a ${scenario.expect.conflict_kind} conflict`);
    }
    const issues = validateInstructionBundle(result.bundle, root, { verifyBindingsAgainstInventory: true });
    if (issues.length > 0) {
      failures.push(`${scenario.scenario_id}: bundle invalid: ${issues.join('; ')}`);
    }

    const reassembled = assembleScenario(scenario);
    if (reassembled.bundle.effective_instruction_digest !== result.bundle.effective_instruction_digest) {
      failures.push(`P4 determinism violated: ${scenario.scenario_id} digests differ across runs`);
    }
  }

  const baseline = assembled.get('ca_full_context_baseline');
  const candidate = assembled.get('ca_reduced_candidate');
  if (baseline && candidate) {
    if (candidate.selected_source_count >= baseline.selected_source_count) {
      failures.push(`P1 reduction violated: candidate ${candidate.selected_source_count} >= baseline ${baseline.selected_source_count}`);
    }
    const candidateRefs = new Map(candidate.bundle.selected_sources.map((source) => [source.ref, source]));
    for (const source of baseline.bundle.selected_sources) {
      if (!['canonical', 'canonical_contract'].includes(source.binding_class)) {
        continue;
      }
      const retained = candidateRefs.get(source.ref);
      if (!retained) {
        failures.push(`P2 retention violated: binding source ${source.ref} fell out of the candidate`);
      } else if (retained.source_digest !== source.source_digest) {
        failures.push(`P2 retention violated: binding source ${source.ref} digests differ`);
      }
    }
    if (candidate.bundle.effective_instruction_digest === baseline.bundle.effective_instruction_digest) {
      failures.push('P4 digest sensitivity violated: baseline and candidate share one digest');
    }
  }

  return { failures, assembled };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const { failures } = evaluateContextAssembly();
    if (failures.length > 0) {
      console.error(`context-assembly eval: ${failures.length} failure(s)`);
      for (const failure of failures) {
        console.error(` - ${failure}`);
      }
      process.exit(2);
    }
    console.log('context-assembly eval: reduction, retention, eligibility and determinism proven');
    process.exit(0);
  } catch (error) {
    console.error(`config error: ${error.message}`);
    process.exit(3);
  }
}
