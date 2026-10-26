# Backend local — Workers, Hono e D1

O backend agora pode ser executado localmente com Hono no runtime Workers e D1 emulado. **Não há login, sessão aceita pelo HTTP, consulta Steam, banco online ou recurso remoto criado.** O React continua no modo demo e não precisa do backend para funcionar.

## Execução no Windows

Requisitos: Node 24 (mínimo 24.15), npm e Windows com suporte ao runtime local do Wrangler/workerd. O funcionamento foi validado nesta máquina; outro ambiente pode precisar dos pré-requisitos nativos indicados pela Cloudflare. Não é necessário login Cloudflare, domínio, token Cloudflare ou segredo Steam.

Na raiz do projeto, use PowerShell:

```powershell
npm.cmd ci
npm.cmd run backend:db:migrate
npm.cmd run backend:dev
```

Em outro terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Resultado esperado: `status: ok`. O endpoint executa somente `SELECT 1`; não enumera tabelas nem comprova que o login está pronto. Falta/falha do binding responde 503 com `status: unavailable`, sem detalhes internos. GET e HEAD são permitidos; os demais métodos recebem 405.

Use `Ctrl+C` para encerrar. O servidor é restrito a `127.0.0.1:8787`. As ferramentas locais de inspeção fornecidas pelo Wrangler são separadas das rotas da aplicação; não exponha a porta na rede nem use dados reais neste ambiente. Para a interface, abra outro terminal e execute `npm.cmd run dev`; não altere a URL de API do frontend nesta etapa.

## Configuração e segredos

- [wrangler.jsonc](../backend/wrangler.jsonc) define entrada, data de compatibilidade, binding `DB` e migrações. O UUID é um marcador local, não um banco remoto.
- Scripts de execução e migração incluem `--local`; o binding declara `remote: false`. Não há conta, domínio, rota pública ou credencial de deploy configurada. `workers_dev` e previews estão desabilitados.
- Métricas do Wrangler e observabilidade remota estão desativadas. A aplicação não registra URL, headers, cookies, corpos ou erros do fornecedor em logs.
- [bindings.ts](../backend/src/bindings.ts) reserva `STEAM_API_KEY` opcional. Nenhuma rota atual lê esse segredo. O [exemplo público](../backend/.dev.vars.example) tem somente valor vazio e não precisa ser copiado.
- Um futuro segredo local ficará em `backend/.dev.vars`, ignorado pelo Git. Em uma implantação futura autorizada, usar bindings de segredo padrão do Worker, provisionados separadamente. Nunca usar `vars`, `VITE_*`, arquivos versionados, logs ou parâmetros de URL para segredos.
- O cliente Steam existente recebeu ajuste de compatibilidade com o `fetch` Workers: somente headers construídos explicitamente, sem header Cookie ou armazenamento implícito de cookies. Não é utilizado pelas rotas atuais.

## Rotas e restrições atuais

| Rota | Resultado |
| --- | --- |
| GET/HEAD `/health` | 200 se D1 responde, ou 503 genérico. Sem versão, ambiente, usuário ou segredo. |
| Outros métodos `/health` | 405. |
| `/auth` e `/auth/*` | 501, autenticação não implementada. Não redirecionam nem emitem cookie. |
| `/api` e `/api/*` | 401 incondicional, sem consultas de dados privados. |
| Outras rotas | 404 JSON genérico, sem eco do caminho ou query string. |

As respostas usam `Cache-Control: no-store`, headers de segurança e política restritiva para conteúdo. Não existe CORS permissivo, modo de login de teste, bypass por variável, header de identidade confiável ou aceitação de bearer/cookie. Mesmo uma sessão sintética inserida no banco não concede acesso HTTP. CORS não é usado como substituto de autorização.

## Migrações D1

O comando local grava estado em `.wrangler/state`, ignorado pelo Git. Não utilize `--remote`, comandos de criação ou deploy nesta etapa. Reexecutar o comando aplica somente migrações pendentes, registradas pelo executor D1.

| Migração | Finalidade |
| --- | --- |
| `0001_initial.sql` | Preservada: usuários, preferências, desejos e metas do rascunho original. |
| `0002_data_validation.sql` | Triggers para SteamID64, AppID positivo/uint32 e preferências em objeto JSON limitado; verifica dados legados sem apagá-los. |
| `0003_auth_foundation.sql` | Estruturas de sessões, tentativas, nonces e grants de retorno desktop, com hashes e expiração. Não implementa autenticação. |
| `0004_null_and_utf8_validation.sql` | Fecha a exceção de PK TEXT nula do SQLite e aplica o limite JSON de 16 KiB em bytes UTF-8. Não reescreve migrações já aplicadas. |

Dados legados inválidos fazem a migração falhar; não há exclusão corretiva automática. As mudanças de cada migração são atômicas no executor D1. Antes de uso real, será preciso revisar o esquema e validar migração, recuperação e limpeza de registros expirados no ambiente autorizado.

Chaves estrangeiras têm exclusão em cascata; tabelas por usuário usam SteamID64. **Isso não implementa isolamento de acesso por si só.** No futuro, cada consulta deverá derivar o usuário da sessão verificada e usar SQL parametrizado. Atualmente o HTTP bloqueia todos esses acessos.

## Verificações e CI

```powershell
npm.cmd run check
```

O comando verifica TypeScript do frontend/testes e do Worker, lint, migrações locais, testes de ambos, build React e build Worker em dry-run. Separadamente:

```powershell
npm.cmd run typecheck:backend
npm.cmd run test:backend
npm.cmd run backend:build
```

`backend:build` usa `wrangler deploy --dry-run`: gera o bundle em `backend/dist/backend` conforme resolução do diretório de configuração, sem upload, deploy ou criação de recursos. A mensagem “Total Upload” do Wrangler representa o tamanho calculado do bundle. Os diretórios `dist/` são ignorados pelo Git.

Os testes usam `getPlatformProxy` com bindings remotos explicitamente desativados, D1 temporário sem persistência e configuração isolada de `.dev.vars`. Aplicam o mesmo conjunto de migrações, preservam usuários válidos do esquema inicial e verificam integridade, validações, cascata e primitivas SQL de expiração, revogação e uso único. Também testam rotas, falhas sanitizadas, métodos, headers falsificados e requisições cross-origin. Essas provas não equivalem a login/CSRF OpenID implementado ou a um teste de segurança em produção.

A CI executa as mesmas verificações em Windows e Ubuntu, usando apenas runners padrão de repositório público. Não recebe secrets, não cria D1 remoto, não faz deploy e não publica artefatos. O job permanece desativado em repositórios privados para evitar consumo de cotas/billing.

Wrangler/Miniflare traziam uma versão transitiva de Undici com avisos conhecidos. O [package.json](../package.json) fixa `miniflare → undici` em `7.30.1`; a compatibilidade é exercitada pelos testes locais e a auditoria npm deve ser revista ao atualizar dependências. Os avisos de terceiros estão em [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md).

## Custo adicional zero

O desenvolvimento desta etapa é local e não exige serviços ou recursos contratados. A documentação oferece planos gratuitos para [Workers](https://developers.cloudflare.com/workers/platform/pricing/) e [D1](https://developers.cloudflare.com/d1/platform/pricing/), com cotas e limitações; não foi ativado nenhum plano remoto. Uma futura operação deve comprovar elegibilidade, limites, orçamento de consultas/armazenamento e suspensão segura na cota, sem upgrade ou cobrança automática. Não há garantia de disponibilidade ou escala ilimitada.

## Fontes técnicas e próximos requisitos

- [Hono em Workers](https://hono.dev/docs/getting-started/cloudflare-workers).
- [Desenvolvimento local D1](https://developers.cloudflare.com/d1/best-practices/local-development/) e [migrações](https://developers.cloudflare.com/d1/reference/migrations/).
- [Configuração Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/), [bindings locais para testes](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy) e [segredos do Worker](https://developers.cloudflare.com/workers/configuration/secrets/).

A arquitetura de autenticação e os bloqueadores para login real estão em [AUTHENTICATION.md](AUTHENTICATION.md). Não implementar o login antes de comprovar esses requisitos.
