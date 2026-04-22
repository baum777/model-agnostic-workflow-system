import fs from 'node:fs';
import path from 'node:path';

export function repoRoot() {
  return process.cwd();
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

export function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

export function exists(filePath) {
  return fs.existsSync(filePath);
}

export function isInsideRoot(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function listFilesRecursive(rootPath, predicate = () => true, relativeBase = rootPath, output = []) {
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const fullPath = path.join(rootPath, entry.name);
    const relativePath = path.relative(relativeBase, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      listFilesRecursive(fullPath, predicate, relativeBase, output);
    } else if (predicate(fullPath, relativePath)) {
      output.push({ fullPath, relativePath });
    }
  }
  return output;
}

export function parseSkillFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('Missing YAML frontmatter.');
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf(':');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    const value = raw.replace(/^["']|["']$/g, '');
    if (value === 'true') {
      fields[key] = true;
    } else if (value === 'false') {
      fields[key] = false;
    } else {
      fields[key] = value;
    }
  }
  return fields;
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === '[]') return [];
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, '');
}

export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root, container: 'object' }];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }

    const indent = rawLine.match(/^ */)[0].length;
    const trimmed = rawLine.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    if (trimmed.startsWith('- ')) {
      if (parent.container !== 'array') {
        throw new Error(`Unexpected list item: ${trimmed}`);
      }

      const itemContent = trimmed.slice(2);
      if (!itemContent.includes(':')) {
        parent.value.push(parseScalar(itemContent));
        continue;
      }

      const separator = itemContent.indexOf(':');
      const key = itemContent.slice(0, separator).trim();
      const remainder = itemContent.slice(separator + 1).trim();
      const objectItem = {};

      if (remainder) {
        objectItem[key] = parseScalar(remainder);
        parent.value.push(objectItem);
        stack.push({ indent, value: objectItem, container: 'object' });
      } else {
        objectItem[key] = {};
        parent.value.push(objectItem);
        stack.push({ indent, value: objectItem[key], container: 'object' });
      }
      continue;
    }

    const separator = trimmed.indexOf(':');
    if (separator === -1) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    const key = trimmed.slice(0, separator).trim();
    const remainder = trimmed.slice(separator + 1).trim();
    if (remainder) {
      parent.value[key] = parseScalar(remainder);
      continue;
    }

    let nextMeaningfulIndex = index + 1;
    while (nextMeaningfulIndex < lines.length && (!lines[nextMeaningfulIndex].trim() || lines[nextMeaningfulIndex].trim().startsWith('#'))) {
      nextMeaningfulIndex += 1;
    }

    const nextRawLine = lines[nextMeaningfulIndex] || '';
    const nextIndent = nextRawLine.match(/^ */)[0].length;
    const nextTrimmed = nextRawLine.trim();
    const isArray = nextTrimmed.startsWith('- ') && nextIndent > indent;
    parent.value[key] = isArray ? [] : {};
    stack.push({ indent, value: parent.value[key], container: isArray ? 'array' : 'object' });
  }

  return root;
}
