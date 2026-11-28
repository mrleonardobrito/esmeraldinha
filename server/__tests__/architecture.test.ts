import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preProcessFile } from 'typescript';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const modules = resolve(root, 'modules');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) :
      entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function segments(parent: string, child: string): string[] {
  return relative(parent, child).split(sep);
}

function modulePath(path: string): string[] | null {
  const parts = segments(modules, path);
  return parts[0] && parts[0] !== '..' && !parts[0].includes(':') ? parts : null;
}

it('keeps migrated module boundaries explicit', () => {
  const violations: string[] = [];
  for (const file of sourceFiles(root)) {
    const from = modulePath(file);
    const layer = from?.[1];
    const imports = preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles;
    for (const entry of imports) {
      const specifier = entry.fileName;
      const target = specifier.startsWith('.') ? modulePath(resolve(dirname(file), specifier)) : null;
      const crossModule = target && from?.[0] !== target[0];
      const publicEntry = target && (target.length === 1 ||
        (target.length === 2 && ['index', 'index.ts', 'index.js'].includes(target[1])));
      const invalidPublicImport = crossModule && !publicEntry;
      const invalidDomainImport = layer === 'domain' &&
        (!target || target[0] !== from?.[0] || target[1] !== 'domain');
      const invalidApplicationImport = layer === 'application' &&
        (!target || (target[0] === from?.[0] && !['application', 'domain'].includes(target[1])));
      if (invalidPublicImport || invalidDomainImport || invalidApplicationImport)
        violations.push(`${relative(root, file)} -> ${specifier}`);
    }
  }
  expect(violations).toEqual([]);
});
