import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Bindings } from './bindings';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  referrerPolicy: 'no-referrer',
}));
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

app.get('/health', async c => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 AS healthy').first<{ healthy: number }>();
    if (result?.healthy !== 1) return c.json({ status: 'unavailable' }, 503);
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'unavailable' }, 503);
  }
});
app.all('/health', c => {
  c.header('Allow', 'GET, HEAD');
  return c.json({ error: { code: 'method_not_allowed' } }, 405);
});

// Reservas bloqueadas incondicionalmente. Não há validação falsa de sessão ou modo bypass.
for (const path of ['/auth', '/auth/*']) {
  app.all(path, c => c.json({ error: { code: 'authentication_not_implemented' } }, 501));
}
for (const path of ['/api', '/api/*']) {
  app.all(path, c => c.json({ error: { code: 'authentication_required' } }, 401));
}

// Sem CORS permissivo, logger, eco de input, consulta Steam ou rota de administração.
app.notFound(c => c.json({ error: { code: 'not_found' } }, 404));
app.onError((_error, c) => c.json({ error: { code: 'internal_error' } }, 500));

export default app;
