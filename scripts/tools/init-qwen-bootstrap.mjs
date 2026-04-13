#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, listFilesRecursive, repoRoot, writeText } from './_shared.mjs';

function parseArgs(argv) {
  const args = { consumer: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--consumer' && argv[index + 1]) {
      args.consumer = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function copyTemplateTree({ templateRoot, consumerRoot }) {
  const generatedFiles = [];
  for (const entry of listFilesRecursive(templateRoot)) {
    const targetPath = path.join(consumerRoot, entry.relativePath);
    writeText(targetPath, fs.readFileSync(entry.fullPath, 'utf8'));
    generatedFiles.push(entry.relativePath);
  }
  return generatedFiles;
}

function initQwenBootstrap({ sourceRoot, consumerRoot }) {
  const templateRoot = path.join(sourceRoot, 'templates', 'qwen-bootstrap');
  const bootstrapRoot = path.join(consumerRoot, '.qwen');

  if (!exists(templateRoot)) {
    throw new Error(`Missing Qwen bootstrap template pack: ${normalize(templateRoot)}.`);
  }
  if (exists(bootstrapRoot)) {
    throw new Error(`Refusing to initialize Qwen bootstrap because ${normalize(bootstrapRoot)} already exists. Re-run is not automatic and overwrite is disabled.`);
  }

  const generatedFiles = copyTemplateTree({ templateRoot, consumerRoot });

  return {
    ok: true,
    consumerRoot: normalize(consumerRoot),
    templateRoot: normalize(templateRoot),
    generatedFiles
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = initQwenBootstrap({ sourceRoot: repoRoot(), consumerRoot: parseArgs(process.argv.slice(2)).consumer });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  }
}

export { initQwenBootstrap };
