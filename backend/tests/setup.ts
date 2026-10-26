// Nunca iniciar métricas, carregar .env do projeto ou habilitar bindings remotos nos testes.
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
