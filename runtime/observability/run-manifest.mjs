import fs from 'node:fs';
import path from 'node:path';

function writeRunManifest(context, contractSources, status = 'completed') {
  const manifestPath = path.join(context.runDir, 'manifest.json');
  const manifest = {
    runId: context.runId,
    createdAt: context.createdAt,
    mode: context.mode,
    runtimeVersion: context.runtimeVersion,
    contractSources,
    status,
    entrypoint: context.entrypoint
  };

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, manifestPath };
}

function writePermissionLog(context, decisions) {
  const permissionsPath = path.join(context.runDir, 'permissions.jsonl');
  fs.mkdirSync(path.dirname(permissionsPath), { recursive: true });
  fs.writeFileSync(permissionsPath, decisions.map((decision) => JSON.stringify(decision)).join('\n') + '\n', 'utf8');
  return permissionsPath;
}

export { writePermissionLog, writeRunManifest };
