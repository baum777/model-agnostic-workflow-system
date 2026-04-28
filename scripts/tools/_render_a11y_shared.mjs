import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';

export const RENDER_A11Y_VERSION = '1.0.0';
export const VALID_MODES = new Set(['certification', 'operator-evidence']);
export const FINDING_STATUSES = new Set(['confirmed-issue', 'likely-issue', 'manual-review-area', 'not-assessed']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

export function normalizePath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

export function ensureMode(value) {
  const mode = String(value || 'certification').trim();
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid mode: ${mode}. Expected certification or operator-evidence.`);
  }
  return mode;
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
}

export function resolveRenderA11yChromePath(playwrightChromium = null) {
  const envOverride = firstNonEmpty([
    process.env.RENDER_A11Y_CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH
  ]);
  if (envOverride && fs.existsSync(envOverride)) {
    return path.resolve(envOverride);
  }

  if (playwrightChromium && typeof playwrightChromium.executablePath === 'function') {
    const resolved = firstNonEmpty([playwrightChromium.executablePath()]);
    if (resolved && fs.existsSync(resolved)) {
      return path.resolve(resolved);
    }
  }

  const commonPaths = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ];
  for (const candidate of commonPaths) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }
  return null;
}

export function resolveRenderA11yUserDataDir({ baseRoot = process.cwd(), scope = 'default' } = {}) {
  const configured = firstNonEmpty([process.env.RENDER_A11Y_USER_DATA_DIR]);
  const resolved = configured
    ? path.resolve(configured)
    : path.resolve(baseRoot, 'artifacts', 'render-a11y-runtime', 'profiles', scope);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function buildRenderA11yChromiumLaunchOptions(playwrightChromium, { baseRoot = process.cwd(), scope = 'default', headless = true } = {}) {
  const executablePath = resolveRenderA11yChromePath(playwrightChromium);
  const options = {
    headless,
    args: [
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  };
  if (executablePath) {
    options.executablePath = executablePath;
  }
  // Ensure runtime profile root exists even for tools that do not consume user-data-dir directly.
  resolveRenderA11yUserDataDir({ baseRoot, scope });
  return options;
}

export function formatRuntimeLaunchFailure(error, { executablePath = null, userDataDir = null } = {}) {
  const baseMessage = error?.message || String(error);
  const suffix = [];
  if (executablePath) {
    suffix.push(`chromePath=${normalizePath(executablePath)}`);
  }
  if (userDataDir) {
    suffix.push(`userDataDir=${normalizePath(userDataDir)}`);
  }
  if (/spawn EPERM|Zugriff verweigert|Access is denied/i.test(baseMessage)) {
    suffix.push('hint=Browser-Launch permission denied; set RENDER_A11Y_CHROME_PATH/RENDER_A11Y_USER_DATA_DIR or run outside restricted sandbox.');
  }
  return suffix.length > 0 ? `${baseMessage} (${suffix.join(', ')})` : baseMessage;
}

export function toFileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

export function classifyIssueStatus({ severity = 'warning', confidence = 'high' } = {}) {
  const normalizedSeverity = String(severity).toLowerCase();
  const normalizedConfidence = String(confidence).toLowerCase();

  if (normalizedSeverity === 'error' || normalizedSeverity === 'critical') {
    return 'confirmed-issue';
  }
  if (normalizedSeverity === 'warning' && normalizedConfidence === 'high') {
    return 'likely-issue';
  }
  if (normalizedSeverity === 'warning' || normalizedSeverity === 'info') {
    return 'manual-review-area';
  }
  return 'not-assessed';
}

export async function startStaticServer(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const server = http.createServer((req, res) => {
    try {
      const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const candidatePath = requestPath === '/' ? '/index.html' : requestPath;
      const absolutePath = path.resolve(root, `.${candidatePath}`);
      const relative = path.relative(root, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const extension = path.extname(absolutePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[extension] || 'application/octet-stream');
      fs.createReadStream(absolutePath).pipe(res);
    } catch {
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  const address = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

export function buildEnvelope({ tool, mode, input, runtime, evidence, findings, nonClaims, ok }) {
  return {
    ok,
    tool,
    version: RENDER_A11Y_VERSION,
    mode,
    input,
    runtime,
    evidence,
    findings,
    nonClaims
  };
}
