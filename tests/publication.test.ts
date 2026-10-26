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
    'backend/.dev.vars', 'backend/.dev.vars.local', 'backend/dist/index.js',
    'backend/.wrangler/state/local.sqlite',
  ])('exclui %s', path => {
    expect(rules.ignores(path)).toBe(true);
  });

  it.each([
    '.env.example', 'AGENTS.md', '.nvmrc', '.github/workflows/ci.yml', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
    'package.json', 'package-lock.json', 'eslint.config.js', 'vitest.config.ts',
    'src/App.tsx', 'src/exportImage.ts', 'tests/App.test.tsx',
    'backend/migrations/0001_initial.sql', 'docs/SECURITY.md', 'README.md',
    'backend/.dev.vars.example', 'backend/wrangler.jsonc', 'vitest.backend.config.ts',
  ])('preserva %s', path => {
    expect(rules.ignores(path)).toBe(false);
  });

  it('mantém somente valores vazios no exemplo público de ambiente', () => {
    const example = readFileSync(`${root}/.env.example`, 'utf8');
    const assignments = example.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
    expect(assignments).toEqual(['VITE_API_BASE_URL=']);
  });

  it('mantém o exemplo de segredo exclusivamente no backend e vazio', () => {
    const example = readFileSync(`${root}/backend/.dev.vars.example`, 'utf8');
    const assignments = example.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'));
    expect(assignments).toEqual(['STEAM_API_KEY=']);
  });

  it('mantém configuração Worker local sem conta, rotas ou segredos públicos', () => {
    const config = JSON.parse(readFileSync(`${root}/backend/wrangler.jsonc`, 'utf8'));
    expect(config.account_id).toBeUndefined();
    expect(config.routes).toBeUndefined();
    expect(config.vars).toBeUndefined();
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.send_metrics).toBe(false);
    expect(config.dev.ip).toBe('127.0.0.1');
    expect(config.d1_databases).toEqual([expect.objectContaining({
      binding: 'DB', remote: false, database_id: '00000000-0000-0000-0000-000000000001',
    })]);
  });
});
