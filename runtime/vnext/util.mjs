// Shared vNext runtime utilities. Pure, dependency-free (node builtins only).
// Runtime modules may reduce effective scope fail-closed but never widen
// authority; these helpers carry no authority semantics.
import { createHash, randomUUID } from 'node:crypto';

export function nowIso(clock) {
  if (clock) {
    return clock();
  }
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export class FailClosedError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FailClosedError';
    this.code = code;
    this.details = details;
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

// Outbound URL guard: http/https only, host must be in the explicit allowlist,
// localhost/loopback/private/reserved addresses are rejected fail-closed.
const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback', 'metadata.google.internal']);
const BLOCKED_TLDS = ['.local', '.internal'];

function isBlockedIpv4(hostname) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [first, second] = octets;
  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  return false;
}

export function assertOutboundUrlAllowed(rawUrl, allowlist) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FailClosedError('URL_INVALID', `outbound URL is not parseable: ${rawUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new FailClosedError('URL_PROTOCOL_FORBIDDEN', `only http/https outbound URLs are allowed, got ${url.protocol}`);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!allowlist.includes(hostname)) {
    throw new FailClosedError('URL_HOST_NOT_ALLOWLISTED', `outbound host ${hostname} is not in the explicit allowlist`);
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_TLDS.some((tld) => hostname.endsWith(tld))) {
    throw new FailClosedError('URL_HOST_BLOCKED', `outbound host ${hostname} is blocked`);
  }
  if (hostname.includes(':') || hostname.endsWith(':1')) {
    throw new FailClosedError('URL_HOST_BLOCKED', `loopback IPv6 outbound host ${hostname} is blocked`);
  }
  if (isBlockedIpv4(hostname)) {
    throw new FailClosedError('URL_HOST_BLOCKED', `private/reserved outbound host ${hostname} is blocked`);
  }
  return url;
}
