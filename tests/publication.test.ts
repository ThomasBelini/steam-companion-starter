// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const rules = ignore().add(readFileSync(`${root}/.gitignore`, 'utf8'));

describe('arquivos permitidos na publicação', () => {
  it.each([
    '.env', '.env.local', '.env.production', '.env.staging', 'backend/.env.production',
    '.envrc', '.npmrc', '.netrc', '.dev.vars', 'backend/.dev.vars.production',
    'credentials.local.json', 'secrets.json', 'server.key', 'signing.pfx', 'id_ed25519',
    'data/cache.sqlite', 'data/cache.sqlite-wal', 'data/session.db-shm',
    'dist/index.html', 'node_modules/react/index.js', 'coverage/index.html',
    'tsconfig.tsbuildinfo', '.wrangler/state/cache', 'src-tauri/target/debug/app.exe',
    'notes.tmp', 'notes.temp', 'README.md.bak', '.App.tsx.swp', '.App.tsx.swo',
    'notes~', 'Thumbs.db', 'Desktop.ini',
  ])('exclui %s', path => {
    expect(rules.ignores(path)).toBe(true);
  });

  it.each([
    '.env.example', 'AGENTS.md', '.nvmrc', '.github/workflows/ci.yml', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
    'package.json', 'package-lock.json', 'eslint.config.js', 'vitest.config.ts',
    'src/App.tsx', 'src/exportImage.ts', 'tests/App.test.tsx',
    'backend/migrations/0001_initial.sql', 'docs/SECURITY.md', 'README.md',
  ])('preserva %s', path => {
    expect(rules.ignores(path)).toBe(false);
  });

  it('mantém somente valores vazios no exemplo público de ambiente', () => {
    const example = readFileSync(`${root}/.env.example`, 'utf8');
    const assignments = example.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
    expect(assignments).toEqual(['VITE_API_BASE_URL=']);
  });
});
