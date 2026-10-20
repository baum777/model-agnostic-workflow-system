#!/usr/bin/env node
// S11 validator: harness context records, WorkUnit context references, bound
// graph context bindings, and supersession context-change evidence.
// Mirrors validate-behavioral-eval.mjs: validation logic is exported for
// tests; the CLI is isMain-guarded so importing this module never exits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import {
  HARNESS_CONTEXT_VALUES,
  PRODUCT_AUTHORITY_REF_PREFIX,
  contextOfRuntimeHarness,
  validateHarnessContextRecord,
  assertWorkUnitContextBinding,
  assertNoProductAuthorityFromDevContext,
  assertSupersessionContextChange
} from '../../runtime/harness-context/context-binding.mjs';

const HARNESS_CONTEXT_CONTRACT = 'core/contracts/harness-context.schema.json';
const WORK_UNIT_CONTRACT = 'core/contracts/work-unit.schema.json';
const BOUND_GRAPH_CONTRACT = 'core/contracts/bound-execution-graph.schema.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// semanticContextIssues({ harnessContext, workUnit, boundGraph, root })
//   -> string[]. Schema issues plus the S11 semantic rules the schema engine
//      cannot express on its own. Every argument except root is optional;
//      absent surfaces are simply not checked.
export function semanticContextIssues({ harnessContext, workUnit, boundGraph, root }) {
  const issues = [];

  if (harnessContext !== undefined && harnessContext !== null) {
    for (const issue of validateInstanceAgainstContract(harnessContext, HARNESS_CONTEXT_CONTRACT, root)) {
      issues.push(`harness_context: ${issue}`);
    }
    try {
      validateHarnessContextRecord(harnessContext, root);
    } catch (error) {
      issues.push(`harness_context: ${error.code}: ${error.message}`);
    }
  }

  if (workUnit !== undefined && workUnit !== null) {
    for (const issue of validateInstanceAgainstContract(workUnit, WORK_UNIT_CONTRACT, root)) {
      issues.push(`work_unit: ${issue}`);
    }
    if (harnessContext) {
      try {
        assertWorkUnitContextBinding({ workUnit, context: harnessContext });
        assertNoProductAuthorityFromDevContext({
          context: harnessContext,
          authoritySourceRefs: workUnit.authority_ceiling?.authority_source_refs || []
        });
      } catch (error) {
        issues.push(`work_unit: ${error.code}: ${error.message}`);
      }
    }
  }

  if (boundGraph !== undefined && boundGraph !== null) {
    for (const issue of validateInstanceAgainstContract(boundGraph, BOUND_GRAPH_CONTRACT, root)) {
      issues.push(`bound_graph: ${issue}`);
    }
    const declared = new Set(
      (boundGraph.nodes || []).map((node) => node?.executor_binding?.harness_context).filter(Boolean)
    );
    if (declared.size > 1) {
      issues.push(`bound_graph: nodes declare mixed harness contexts (${[...declared].join(', ')}); one graph version binds one context`);
    }
    const refs = new Set(
      (boundGraph.nodes || []).map((node) => node?.executor_binding?.harness_context_ref).filter(Boolean)
    );
    if (refs.size > 1) {
      issues.push(`bound_graph: nodes reference multiple harness context records (${[...refs].join(', ')}); one graph version binds one record`);
    }
    if (harnessContext && declared.size === 1) {
      const [context] = declared;
      if (context !== harnessContext.context) {
        issues.push(`bound_graph: node context ${context} does not match bound record ${harnessContext.context}`);
      }
      if (refs.size === 1 && harnessContext.context_id && [...refs][0] !== harnessContext.context_id) {
        issues.push(`bound_graph: node context_ref ${[...refs][0]} does not match bound record ${harnessContext.context_id}`);
      }
    }
    const supersededBy = boundGraph.superseded_by;
    if (supersededBy && typeof supersededBy === 'object') {
      const previousContext = declared.size === 1 ? [...declared][0] : null;
      // A superseded graph records the NEXT version's transition target.
      const nextContext = supersededBy.context_change ? supersededBy.context_change.to_context : null;
      if (previousContext && nextContext) {
        try {
          assertSupersessionContextChange({
            previousContext,
            nextContext,
            contextChange: supersededBy.context_change
          });
        } catch (error) {
          issues.push(`bound_graph: ${error.code}: ${error.message}`);
        }
      }
    }
  }

  return issues;
}

function runCli(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const targets = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--record' || args[index] === '--work-unit' || args[index] === '--graph') {
      targets.push({ kind: args[index].slice(2), file: args[index + 1] });
      index += 1;
    }
  }
  if (targets.length === 0) {
    console.error('usage: validate-harness-context.mjs (--record <file>|--work-unit <file>|--graph <file>)...');
    return { ok: false, issues: ['no validation targets given'] };
  }
  const load = (kind, file) => {
    const value = readJson(path.resolve(file));
    if (kind === 'record') return { harnessContext: value };
    if (kind === 'work-unit') return { harnessContext: targets.some((t) => t.kind === 'record') ? readJson(path.resolve(targets.find((t) => t.kind === 'record').file)) : undefined, workUnit: value };
    return { boundGraph: value, harnessContext: targets.some((t) => t.kind === 'record') ? readJson(path.resolve(targets.find((t) => t.kind === 'record').file)) : undefined };
  };
  const issues = [];
  for (const target of targets) {
    issues.push(...semanticContextIssues({ root, ...load(target.kind, target.file) }));
  }
  return { ok: issues.length === 0, issues };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
