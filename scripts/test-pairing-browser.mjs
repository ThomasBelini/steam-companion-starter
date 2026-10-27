// Isolated native/browser regression. Never reads the native S256 verifier.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const executable = fileURLToPath(new URL(`../src-tauri/target/debug/examples/pairing-lab${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
const children = new Set();
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });

function diagnostic(error) {
  // Playwright includes full navigation URLs in errors. Never forward callback codes to logs.
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/https?:\/\/[^\s"'<>]+/g, '[URL removida]')
    .replace(/[A-Za-z0-9_-]{43,}/g, '[valor removido]');
}

async function start() {
  const child = spawn(executable, ['--simulate'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  const exited = once(child, 'exit');
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => { errors += data; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Native lab startup timed out')), 15_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', data => {
      output += data;
      if (output.includes('Enter cancela.')) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Native lab exited during startup')); });
  });
  const url = output.match(/navegador externo: (http:\/\/127\.0\.0\.1:\d+\/start\?state=[A-Za-z0-9_-]{43})/)?.[1];
  const approval = output.match(/NÃO é o segredo S256\): ([A-Za-z0-9_-]{43})/)?.[1];
  const callback = output.match(/Listener nativo: (127\.0\.0\.1:\d+)/)?.[1];
  assert.ok(url && approval && callback, 'Native lab must expose only the explicit simulation context');
  const context = await browser.newContext();
  context.setDefaultTimeout(10_000);
  const allowed = new Set([new URL(url).origin, `http://${callback}`]);
  await context.route('**/*', route => {
    assert.ok(allowed.has(new URL(route.request().url()).origin), 'No external network permitted');
    return route.continue();
  });
  return { child, exited, url, approval, callback, context, allowed, page: await context.newPage(),
    diagnostics: () => ({ output, errors }) };
}

async function closed(address) {
  await new Promise((resolve, reject) => {
    const [host, port] = address.split(':');
    const socket = connect({ host, port: Number(port) });
    socket.once('error', resolve);
    socket.once('connect', () => { socket.destroy(); reject(new Error('Ephemeral listener still open')); });
  });
}

async function finish(lab) {
  const [code] = await lab.exited;
  children.delete(lab.child);
  assert.equal(code, 0);
  assert.equal(lab.diagnostics().errors, '');
  assert.doesNotMatch(lab.diagnostics().output, /code=|token=|verifier=/i);
  await closed(lab.callback);
  await closed(new URL(lab.url).host);
  await lab.context.close();
}

async function responseToClick(page, predicate, click) {
  const [response] = await Promise.all([page.waitForResponse(predicate), click()]);
  return response;
}

try {
  const refused = spawnSync(executable, [], { cwd: root, encoding: 'utf8', timeout: 5000 });
  assert.equal(refused.status, 2, 'Lab refuses startup without explicit simulation argument');
  assert.doesNotMatch(refused.stdout, /http:|Confirmação descartável/);
  const lab = await start();
  await lab.page.goto(lab.url);
  await lab.page.getByRole('heading', { name: 'Pareamento SIMULADO' }).waitFor();
  const cookies = await lab.context.cookies();
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].httpOnly, true);
  assert.equal(cookies[0].sameSite, 'Strict');
  assert.equal(cookies[0].secure, false); // Explicitly HTTP lab, never production policy.
  const otherBrowser = await browser.newContext();
  const copiedPage = await otherBrowser.newPage();
  assert.equal((await copiedPage.goto(lab.url)).status(), 403);
  await otherBrowser.close();
  const state = await lab.page.locator('[name=state]').inputValue();
  const csrf = await lab.page.locator('[name=csrf]').inputValue();
  const forged = await lab.context.request.post(`${new URL(lab.url).origin}/confirm`, {
    headers: { Origin: 'https://example.invalid' }, form: { state, csrf, approval: lab.approval },
  });
  assert.equal(forged.status(), 403);
  await lab.page.getByLabel('Confirmação nativa').fill('A'.repeat(43));
  const denied = await responseToClick(lab.page, response => response.url().endsWith('/confirm'),
    () => lab.page.getByRole('button', { name: 'Confirmar simulação neste computador' }).click());
  assert.equal(denied.status(), 403);
  await lab.page.goto(lab.url);
  await lab.page.getByLabel('Confirmação nativa').fill(lab.approval);
  const confirmResponse = await responseToClick(lab.page, response => response.url().endsWith('/confirm'),
    () => lab.page.getByRole('button', { name: 'Confirmar simulação neste computador' }).click());
  assert.equal(confirmResponse.status(), 200);
  const nativeResponse = await responseToClick(lab.page, response => new URL(response.url()).host === lab.callback,
    () => lab.page.getByRole('link', { name: 'Concluir no aplicativo de laboratório' }).click());
  assert.equal(nativeResponse.status(), 200, await nativeResponse.text());
  await lab.page.getByRole('heading', { name: 'Pareamento simulado concluído' }).waitFor();
  assert.equal(new URL(lab.page.url()).host, lab.callback);
  assert.deepEqual([...new URL(lab.page.url()).searchParams.keys()].sort(), ['code', 'state']);
  assert.match(await lab.page.locator('body').innerText(), /Nenhuma autenticação Steam ou sessão/);
  await finish(lab);
  console.log('PASS: browser binding, CSRF, explicit confirmation, native return and listener closure');

  const first = await start();
  const second = await start();
  await first.page.goto(first.url);
  await first.page.getByLabel('Confirmação nativa').fill(first.approval);
  await first.page.getByRole('button', { name: 'Confirmar simulação neste computador' }).click();
  const location = await first.page.getByRole('link', { name: 'Concluir no aplicativo de laboratório' }).getAttribute('href');
  const crossReturn = new URL(location);
  crossReturn.host = second.callback;
  assert.equal((await second.page.goto(crossReturn.href)).status(), 403);
  // Give B its own legitimate code, then try A's intercepted code with B's own state.
  await second.page.goto(second.url);
  await second.page.getByLabel('Confirmação nativa').fill(second.approval);
  await second.page.getByRole('button', { name: 'Confirmar simulação neste computador' }).click();
  const secondLocation = await second.page.getByRole('link', { name: 'Concluir no aplicativo de laboratório' }).getAttribute('href');
  const substituted = new URL(secondLocation);
  substituted.searchParams.set('code', new URL(location).searchParams.get('code'));
  assert.equal((await second.page.goto(substituted.href)).status(), 403);
  assert.equal((await first.page.goto(location)).status(), 200);
  await finish(first);
  assert.equal((await second.page.goto(secondLocation)).status(), 200);
  await finish(second);
  assert.equal(first.diagnostics().output.includes(new URL(location).searchParams.get('code')), false);
  assert.equal(second.diagnostics().output.includes(new URL(secondLocation).searchParams.get('code')), false);
  console.log('PASS: independent processes A/B reject crossed returns and substituted intercepted codes');

  const cancelled = await start();
  await cancelled.page.goto(cancelled.url);
  await cancelled.page.getByLabel('Confirmação nativa').fill(cancelled.approval);
  await cancelled.page.getByRole('button', { name: 'Confirmar simulação neste computador' }).click();
  const abandonedReturn = await cancelled.page.getByRole('link', { name: 'Concluir no aplicativo de laboratório' }).getAttribute('href');
  cancelled.child.stdin.write('\n');
  await cancelled.exited;
  const rejectedReturn = await cancelled.context.request.get(abandonedReturn, { timeout: 1000 }).then(() => null, error => error);
  assert.ok(rejectedReturn instanceof Error, 'An issued code cannot return to a cancelled listener');
  const abandonedCode = new URL(abandonedReturn).searchParams.get('code');
  // Reproduces the diagnostic leak in Playwright itself, without printing that diagnostic.
  assert.equal(rejectedReturn.message.includes(abandonedCode), true);
  assert.equal(diagnostic(rejectedReturn).includes(abandonedCode), false);
  assert.equal(diagnostic(new Error(cancelled.approval)).includes(cancelled.approval), false);
  await finish(cancelled);
  console.log('PASS: cancellation rejects an issued code; sensitive browser diagnostics are redacted');

  const defended = await start();
  await defended.page.goto(defended.url);
  const defendedState = await defended.page.locator('[name=state]').inputValue();
  let cookieReachedOtherPort = false;
  const hostile = createServer((request, response) => {
    cookieReachedOtherPort ||= request.headers.cookie?.includes(`sc_lab_${defendedState}=`) ?? false;
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><title>Origem adversarial local de teste</title>Local test only.');
  });
  await new Promise(resolve => hostile.listen(0, '127.0.0.1', resolve));
  const hostileOrigin = `http://127.0.0.1:${hostile.address().port}`;
  defended.allowed.add(hostileOrigin);
  try {
    const attackerPage = await defended.context.newPage();
    await attackerPage.goto(hostileOrigin);
    // Demonstrates the documented limitation: HttpOnly cookies are NOT isolated by port.
    assert.equal(cookieReachedOtherPort, true);
    const [unsolicited] = await Promise.all([
      defended.context.waitForEvent('response', { predicate: response => response.url() === defended.url }),
      attackerPage.evaluate(url => fetch(url, { mode: 'no-cors', credentials: 'include' }), defended.url),
    ]);
    const unsolicitedStatus = unsolicited.status();
    await defended.page.getByLabel('Confirmação nativa').fill(defended.approval);
    const legitimate = await responseToClick(defended.page, response => response.url().endsWith('/confirm'),
      () => defended.page.getByRole('button', { name: 'Confirmar simulação neste computador' }).click());
    const legitimateStatus = legitimate.status();
    assert.equal(unsolicitedStatus, 403, 'Background GET must be denied before it changes browser binding or CSRF');
    assert.equal(legitimateStatus, 200, 'Original legitimate form must remain usable after an attacker GET');
    const intercepted = await defended.page.getByRole('link', { name: 'Concluir no aplicativo de laboratório' }).getAttribute('href');
    for (const method of ['GET', 'POST']) {
      const [forgedReturn] = await Promise.all([
        defended.context.waitForEvent('response', { predicate: response => response.url() === intercepted }),
        attackerPage.evaluate(({ url, method }) => fetch(url, { method, mode: 'no-cors', credentials: 'include' }),
          { url: intercepted, method }),
      ]);
      assert.equal(forgedReturn.status(), 403, 'Hostile page must not deliver even an intercepted valid code via fetch');
    }
    await defended.page.getByRole('link', { name: 'Concluir no aplicativo de laboratório' }).click();
    await defended.page.getByRole('heading', { name: 'Pareamento simulado concluído' }).waitFor();
    await finish(defended);
  } finally {
    hostile.closeAllConnections();
    await new Promise(resolve => hostile.close(resolve));
  }
  console.log('PASS: hostile local page cannot rotate CSRF; cross-port cookie disclosure remains demonstrated');

  // Residual protocol availability risk, deliberately demonstrated rather than called a mitigation.
  const firstOpener = await start();
  const copiedFirst = await browser.newContext();
  try {
    const page = await copiedFirst.newPage();
    assert.equal((await page.goto(firstOpener.url)).status(), 200);
    await page.getByLabel('Confirmação nativa').fill('A'.repeat(43));
    const denied = await responseToClick(page, response => response.url().endsWith('/confirm'),
      () => page.getByRole('button', { name: 'Confirmar simulação neste computador' }).click());
    assert.equal(denied.status(), 403);
    assert.equal((await firstOpener.page.goto(firstOpener.url)).status(), 403);
    firstOpener.child.stdin.write('\n');
    await finish(firstOpener);
  } finally {
    await copiedFirst.close();
  }
  console.log('PASS: copied link opened first can block the intended browser, but cannot confirm without native approval (residual DoS)');
  console.log('5 native/browser laboratory scenarios passed. No Steam, D1, Worker, HTTPS or session tested.');
} catch (error) {
  console.error(diagnostic(error));
  process.exitCode = 1;
} finally {
  await Promise.allSettled([...children].map(child => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    const exited = once(child, 'exit');
    child.kill();
    return exited;
  }));
  await browser.close();
}
