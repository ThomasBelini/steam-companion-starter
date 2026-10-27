// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../src-tauri/tauri.conf.json';
import capability from '../src-tauri/capabilities/main-demo.json';
import viteConfig from '../vite.config';
import demoConfig from '../src-tauri/tauri.pairing-demo.conf.json';

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

  it('isola a ponte demonstrativa em feature Windows debug e quatro comandos com ACL', () => {
    const main = readFileSync(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');
    const build = readFileSync(new URL('../src-tauri/build.rs', import.meta.url), 'utf8');
    const cargo = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
    expect(main).toContain('not(all(debug_assertions, windows))');
    expect(main).toContain('compile_error!');
    expect(main).toContain('#[cfg(feature = "desktop-pairing-demo")]');
    expect(cargo).toContain('desktop-pairing-demo = ["pairing-prototype"]');
    expect(build).toContain('AppManifest::new().commands(');
    expect(build).toContain('CARGO_FEATURE_DESKTOP_PAIRING_DEMO');
    expect(build).toContain('std::env::var("PROFILE").as_deref() != Ok("debug")');
    const capability = demoConfig.app.security.capabilities[1];
    expect(capability).toMatchObject({ local: true, windows: ['main'], permissions: [
      'allow-pairing-demo-start', 'allow-pairing-demo-status', 'allow-pairing-demo-approve', 'allow-pairing-demo-cancel',
    ] });
    expect(capability).not.toHaveProperty('remote');
    const csp = policy(demoConfig.app.security.devCsp);
    expect(csp['connect-src']).toEqual(["'self'", 'ws://127.0.0.1:5173', 'ipc:', 'http://ipc.localhost']);
    expect(demoConfig.app.security).not.toHaveProperty('csp');
    const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
    expect(scripts['desktop:demo']).toContain('--features desktop-pairing-demo');
    for (const name of ['desktop:dev', 'desktop:build', 'desktop:bundle']) {
      expect(scripts[name]).not.toContain('pairing');
    }
  });
});
