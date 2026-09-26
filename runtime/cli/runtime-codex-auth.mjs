#!/usr/bin/env node
// MAWS vNext — Codex ChatGPT auth CLI (runtime-only).
//
//   node runtime/cli/runtime-codex-auth.mjs check
//   node runtime/cli/runtime-codex-auth.mjs login [--device]
//
// check  — non-interactive: binary discovery, login status, live health
//          probe when the stored status reports ChatGPT. NEVER logs in.
// login  — explicit interactive authentication through the official Codex
//          CLI flow. A healthy session short-circuits untouched; exactly
//          one attempt per invocation; the result is re-verified live.
//
// Exit codes: 0 healthy/authenticated, 2 user authentication required,
// 3 stale/invalid authentication, 4 environment/executor failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  codexAuthExitCode,
  createCodexChatGptAuthController
} from '../auth/codex-chatgpt-auth.mjs';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function writeReceipt(root, kind, payload) {
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '');
  const runDir = path.join(root, 'artifacts', 'runtime-runs', `codex-auth-${kind}-${stamp}-${process.pid}`);
  fs.mkdirSync(runDir, { recursive: true });
  const receiptPath = path.join(runDir, 'codex-auth-receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return receiptPath;
}

function printCheck(receipt, receiptPath) {
  const cli = receipt.codex_available ? `PASS (${receipt.codex_version ?? 'version unknown'})` : 'FAIL';
  const mode = receipt.auth_mode === 'chatgpt' ? 'ChatGPT'
    : receipt.auth_mode === 'api_key' ? 'API key (wrong mode for exec_codex_chatgpt)'
      : receipt.auth_mode ?? 'unknown';
  const stored = receipt.login_status === 'chatgpt' ? 'PRESENT'
    : receipt.login_status === 'unknown' ? 'UNKNOWN'
      : (receipt.login_status ?? 'unknown').toUpperCase();
  const health = receipt.health_probe;
  process.stdout.write(`Codex CLI        ${cli}\n`);
  process.stdout.write(`Auth mode        ${mode}\n`);
  process.stdout.write(`Stored status    ${stored}\n`);
  process.stdout.write(`Live health      ${health}\n`);
  process.stdout.write(`\n${receipt.auth_status}\n`);
  if (receipt.auth_status === 'AUTH_STALE' || receipt.auth_status === 'NOT_LOGGED_IN'
    || receipt.auth_status === 'WRONG_AUTH_MODE' || receipt.auth_status === 'AUTH_INTERACTION_REQUIRED') {
    process.stdout.write('\nRun:\nnpm run runtime:codex-auth:login\n');
  }
  process.stdout.write(`\nreceipt: ${receiptPath}\n`);
}

function usage() {
  process.stderr.write('usage: runtime-codex-auth.mjs check | login [--device]\n');
}

const [subcommand, ...rest] = process.argv.slice(2);
if (subcommand !== 'check' && subcommand !== 'login') {
  usage();
  process.exit(4);
}
const device = rest.includes('--device');
if (subcommand === 'login' && rest.some((arg) => arg !== '--device')) {
  usage();
  process.exit(4);
}

const root = repoRoot();
const controller = createCodexChatGptAuthController({ env: process.env, cwd: root });

if (subcommand === 'check') {
  const receipt = await controller.verifyAuthHealth();
  const receiptPath = writeReceipt(root, 'check', receipt);
  printCheck(receipt, receiptPath);
  process.exit(codexAuthExitCode(receipt.auth_status));
}

// login
process.stdout.write('Codex authentication requires user interaction.\n');
process.stdout.write(device
  ? 'Starting official Codex ChatGPT device-auth flow.\n'
  : 'Starting official Codex ChatGPT login flow.\n');
const outcome = await controller.requestLogin({ device });
if (outcome.login_invoked) {
  process.stdout.write('Verifying stored login...\n');
  process.stdout.write('Verifying live Codex access...\n');
} else if (outcome.state === 'AUTH_HEALTHY') {
  process.stdout.write('Existing session is healthy; login was not invoked.\n');
}
process.stdout.write(`\n${outcome.state}${outcome.error_class ? ` (${outcome.error_class})` : ''}\n`);
const loginReceiptPath = writeReceipt(root, 'login', outcome);
process.stdout.write(`\nreceipt: ${loginReceiptPath}\n`);
process.exit(codexAuthExitCode(outcome.state));
