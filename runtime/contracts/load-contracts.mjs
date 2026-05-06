import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_RUNTIME_CONTRACTS = [
  'workflow-routing-map.json',
  'permission-boundary.json',
  'workflow-memory-contract.json',
  'observability-spine.json'
];

function contractRelativePath(contractName) {
  return `core/contracts/${contractName}`;
}

function readContractFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function loadRuntimeContracts(repoRoot = process.cwd()) {
  const root = path.resolve(repoRoot);
  const contractsDir = path.join(root, 'core', 'contracts');
  const issues = [];
  const contracts = new Map();
  const sources = [];

  if (!fs.existsSync(contractsDir)) {
    return {
      ok: false,
      status: 'blocked',
      issues: [`Missing contracts directory: ${path.relative(root, contractsDir).replace(/\\/g, '/')}`],
      contracts,
      sources,
      requiredSources: []
    };
  }

  for (const entry of fs.readdirSync(contractsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const absolutePath = path.join(contractsDir, entry.name);
    const relativePath = contractRelativePath(entry.name);
    try {
      const data = readContractFile(absolutePath);
      contracts.set(entry.name, data);
      sources.push({ name: entry.name, relativePath, absolutePath });
    } catch (error) {
      issues.push(`Invalid contract JSON ${relativePath}: ${error.message}`);
    }
  }

  for (const contractName of REQUIRED_RUNTIME_CONTRACTS) {
    if (!contracts.has(contractName)) {
      issues.push(`Missing required runtime contract: ${contractRelativePath(contractName)}`);
    }
  }

  const requiredSources = REQUIRED_RUNTIME_CONTRACTS
    .filter((contractName) => contracts.has(contractName))
    .map((contractName) => sources.find((source) => source.name === contractName));

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'completed' : 'blocked',
    issues,
    contracts,
    sources,
    requiredSources
  };
}

export { REQUIRED_RUNTIME_CONTRACTS, loadRuntimeContracts };
