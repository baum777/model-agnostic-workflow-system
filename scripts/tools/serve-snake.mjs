#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootDir = path.join(repoRoot, 'examples', 'snake');
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function resolveRequestUrl(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const requestedPath = relativePath ? path.join(rootDir, relativePath) : rootDir;

  if (!requestedPath.startsWith(rootDir)) {
    return null;
  }

  return requestedPath;
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(ext) || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const resolvedPath = resolveRequestUrl(request.url || '/');
  if (!resolvedPath) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }

  const serveIndex = (directoryPath) => {
    const indexPath = path.join(directoryPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      sendFile(response, indexPath);
      return true;
    }
    return false;
  };

  try {
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      if (!serveIndex(resolvedPath)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
      }
      return;
    }
    sendFile(response, resolvedPath);
  } catch {
    const fallback = path.join(rootDir, 'index.html');
    if (fs.existsSync(fallback) && (request.url === '/' || request.url === '/index.html')) {
      sendFile(response, fallback);
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Snake game server running at http://localhost:${port}`);
  console.log(`Serving: ${rootDir}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

