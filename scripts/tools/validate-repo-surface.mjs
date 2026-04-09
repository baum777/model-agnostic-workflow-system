#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './_shared.mjs';
import { validateSharedCorePackage } from './validate-shared-core-package.mjs';
import { validateProviderNeutralCore } from './validate-provider-neutral-core.mjs';

function validateRepoSurface(baseRoot = repoRoot()) {
  const packageResult = validateSharedCorePackage(baseRoot);
  const neutralResult = validateProviderNeutralCore(baseRoot);
  const issues = [
    ...packageResult.ok ? [] : packageResult.issues.map((issue) => `package: ${issue}`),
    ...neutralResult.ok ? [] : neutralResult.issues.map((issue) => `neutral: ${issue}`)
  ];

  return {
    ok: issues.length === 0,
    root: path.resolve(baseRoot).replace(/\\/g, '/'),
    issueCount: issues.length,
    packageResult,
    neutralResult,
    issues
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = validateRepoSurface();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { validateRepoSurface };
