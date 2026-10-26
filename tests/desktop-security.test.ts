// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../src-tauri/tauri.conf.json';
import capability from '../src-tauri/capabilities/main-demo.json';
import viteConfig from '../vite.config';

function policy(text: string) {
  return Object.fromEntries(text.split(';').map(part => part.trim().split(/\s+/)).filter(([name]) => name)
    .map(([name, ...sources]) => [name, sources]));
}

describe('limites de segurança da configuração desktop', () => {
  it('não concede IPC, plugins, APIs globais ou capacidades remotas ao WebView', () => {
    expect(config.app.withGlobalTauri).toBe(false);
    expect(config.app.security.capabilities).toEqual([capability.identifier]);
    expect(capability.windows).toEqual(['main']);
    expect(capability.permissions).toEqual([]);
    expect(capability.local).toBe(true);
    expect(capability).not.toHaveProperty('remote');
    expect(config).not.toHaveProperty('plugins');
    expect(config.app.security.assetProtocol).toEqual({ enable: false, scope: [] });
    expect(readdirSync(new URL('../src-tauri/capabilities', import.meta.url))).toEqual(['main-demo.json']);
  });

  it('bloqueia rede, frames, objetos e formulários no aplicativo compilado', () => {
    const csp = policy(config.app.security.csp);
    for (const directive of ['default-src', 'connect-src', 'object-src', 'frame-src', 'base-uri', 'form-action']) {
      expect(csp[directive]).toEqual(["'none'"]);
    }
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['style-src']).toEqual(["'self'"]);
    // As cores e barras de progresso existentes usam atributos style no React.
    expect(csp['style-src-attr']).toEqual(["'unsafe-inline'"]);
    expect(csp['img-src']).toEqual(["'self'", 'data:']);
    expect(config.app.security).not.toHaveProperty('dangerousDisableAssetCspModification');
  });

  it('restringe as exceções de desenvolvimento ao servidor Vite e seu HMR', () => {
    const dev = policy(config.app.security.devCsp);
    expect(dev['connect-src']).toEqual(["'self'", 'ws://127.0.0.1:5173']);
    expect(dev['script-src']).not.toContain("'unsafe-eval'");
    expect(dev['frame-src']).toEqual(["'none'"]);
    expect(viteConfig.server).toMatchObject({ host: '127.0.0.1', port: 5173, strictPort: true,
      headers: { 'Content-Security-Policy': config.app.security.devCsp } });
    expect(config.build.devUrl).toBe('http://127.0.0.1:5173');
  });

  it('embute somente o frontend e preserva a janela local com decoração nativa', () => {
    expect(config.build.frontendDist).toBe('../dist');
    expect(config.app.windows).toHaveLength(1);
    expect(config.app.windows[0]).toMatchObject({ label: 'main', create: false, url: 'index.html',
      useHttpsScheme: true, dragDropEnabled: false });
    expect(config.bundle).not.toHaveProperty('externalBin');
    expect(config.bundle.resources).toEqual({ '../LICENSE': 'LICENSE', '../THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md' });
  });

  it('não distribui o backend nem dependências de servidor dentro do bundle web', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).not.toMatch(/SteamOpenIdVerifier|SteamWebApi\.server|backend\//);
    expect(config.bundle).not.toHaveProperty('createUpdaterArtifacts');
    expect(config.bundle.windows.nsis.installMode).toBe('currentUser');
  });
});
