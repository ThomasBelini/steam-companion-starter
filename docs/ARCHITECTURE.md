# Arquitetura proposta

## Stack
- Frontend: React + TypeScript (protótipo executável em Vite).
- Desktop: Tauri 2 em [src-tauri](../src-tauri/), reutilizando o build Vite; build Windows, testes Rust e conferência do release no WebView2 aprovados. Instalação/desinstalação e compatibilidade ampliada ainda pendentes. Veja [DESKTOP](DESKTOP.md).
- Backend local implementado: Cloudflare Workers + Hono. Produção futura exige HTTPS e autenticação revisada; não há deploy.
- Persistência local: D1 emulado pelo Wrangler com migrações versionadas. D1 remoto e sincronização ainda não existem; o frontend não acessa o banco.
- Integrações: Steam APIs documentadas, provedores de preço validados, catálogos de guias com fontes.

## Fluxo de dados

Fluxo alvo futuro; conexões externas, IPC autenticado e autenticação abaixo ainda não estão ativas. A estrutura desktop atual envolve somente o demo:

```text
[Aplicativo Tauri + React]
       | HTTPS + sessão curta
       v
[Worker API] --authenticacao OpenID--> [Steam Community]
       |--somente leitura-----------> [Steam Web API]
       |--dados do usuário---------> [D1]
       |--consulta ofertada--------> [Provedores de preços permitidos]
       '--metadados de guias-------> [Fontes com permissão]
```

## Interfaces estáveis
- `LibraryProvider.getGames(signal?)` entrega `LibraryResult`: jogos e indicador de incompletude, ou erro explícito. O demo usa o mesmo contrato; a UI recebe o provedor por injeção e inicia com `DemoLibraryProvider`.
- `Game` usa AppID, minutos jogados, conquistas; ao ligar Steam real o modelo pode acrescentar propriedades opcionais sem quebrar componentes.
- `Deal` tem `finalPriceVerified`, `regionVerified` e `sourceUrl`; não representa dados incompletos como fato certo.

## Preparação da integração Steam

Os contratos, normalizadores e `SteamLibraryProvider` estão implementados sem dependência de React. O transporte `SteamWebApi.server.ts` fica exclusivamente no backend, sem rota Steam ou segredo configurado. A biblioteca é consultada separadamente das conquistas por jogo para evitar consultas em massa. Tempos e progresso desconhecidos não são convertidos em zero. Veja [STEAM_LIBRARY.md](STEAM_LIBRARY.md) para endpoints oficiais, limites, testes e trabalho ainda necessário antes de uma conta real.

O Worker atual só disponibiliza `/health`; reservas `/auth/*` e `/api/*` negam acesso incondicionalmente. Há migrações e testes no D1 emulado, sem produção ou autenticação fake. Configuração, comandos Windows e CI estão em [BACKEND.md](BACKEND.md); OpenID, retorno desktop, sessões, logout, CSRF e bloqueadores estão em [AUTHENTICATION.md](AUTHENTICATION.md).

## Regras
- Desktop atual: sem plugins, comandos de aplicação ou permissões IPC; CSP de produção sem rede, navegação limitada à origem interna e popups bloqueados. Backend não é empacotado ou iniciado pelo Tauri. Exportação continua Canvas/download do WebView, sem acesso genérico ao filesystem; gravação nativa aprovada em teste isolado, com destino padrão do usuário ainda sujeito à conferência manual.
- O frontend nunca comunica diretamente uma chave secreta a fornecedor externo.
- Steam API key exclusiva no ambiente secreto do Worker.
- Sessão e consultas de perfil verificam SteamID no backend (não confiar em SteamID passado no corpo da requisição).
- Cache com TTL e rate limiting para respeitar cotas.
- Endpoints de administração não ficam públicos.
- Inicialmente somente leitura das contas Steam.

## Modelo local de banco e preparação futura
- `users`: steam_id, created_at, last_seen_at, profile_visibility.
- `user_settings`: preferências por usuário.
- `user_wishlist`: steam_id + app_id, timestamp.
- `user_goals`: steam_id + app_id + state.
- `sessions`: estrutura preparatória de hash, usuário, expiração, revogação e vínculo CSRF; sem emissão/validação HTTP nesta etapa.
- `auth_attempts`, `openid_nonces`, `desktop_grants`: estrutura preparatória para tentativa, antirreplay e retorno desktop.
- `session_origins`: histórico de emissão com origem única; a limpeza de tentativas/grants não apaga sessões. Legado e garantias SQL de 0005 estão em [D1_INTEGRITY](D1_INTEGRITY.md).
- `saved_guides`: proposta futura, ainda não há tabela ou funcionalidade.

Veja as [migrações](../backend/migrations/) e sua revisão em [BACKEND.md](BACKEND.md). A migração original foi preservada; as seguintes validam os dados e acrescentam as estruturas. Isso não torna a aplicação pronta para contas reais.

## Primeira prova de viabilidade antes de login real
1. Validar callback OpenID com `workers.dev` e domínio/realm.
2. Verificar elegibilidade para emissão e uso da Steam Web API key sem pagar domínio.
3. Verificar acesso ao GetOwnedGames e GetPlayerAchievements de uma conta de teste com privacidade apropriada.
4. Somente depois implementar o ciclo de sessão do desktop (link profundo, código de uso único e proteção contra replay).
