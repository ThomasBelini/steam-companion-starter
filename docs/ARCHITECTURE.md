# Arquitetura proposta

## Stack
- Frontend: React + TypeScript (protótipo executável em Vite).
- Desktop: Tauri 2 (adicionar após protótipo e pré-requisitos Windows).
- Backend futuro: Cloudflare Workers + Hono, HTTPS obrigatório.
- Persistência futura: D1 (SQL); armazenamento local somente de cache e preferências não sensíveis.
- Integrações: Steam APIs documentadas, provedores de preço validados, catálogos de guias com fontes.

## Fluxo de dados

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

Os contratos, normalizadores e `SteamLibraryProvider` estão implementados sem dependência de React. O transporte `SteamWebApi.server.ts` fica exclusivamente no backend, sem rota ou segredo configurado. A biblioteca é consultada separadamente das conquistas por jogo para evitar consultas em massa. Tempos e progresso desconhecidos não são convertidos em zero. Veja [STEAM_LIBRARY.md](STEAM_LIBRARY.md) para endpoints oficiais, limites, testes e trabalho ainda necessário antes de uma conta real.

## Regras
- O frontend nunca comunica diretamente uma chave secreta a fornecedor externo.
- Steam API key exclusiva no ambiente secreto do Worker.
- Sessão e consultas de perfil verificam SteamID no backend (não confiar em SteamID passado no corpo da requisição).
- Cache com TTL e rate limiting para respeitar cotas.
- Endpoints de administração não ficam públicos.
- Inicialmente somente leitura das contas Steam.

## Modelo preliminar de banco
- `users`: steam_id, joined_at, last_seen_at, profile_visibility.
- `user_settings`: preferências por usuário.
- `wishlist`: steam_id + appid, timestamp.
- `user_goals`: steam_id + appid + status.
- `sessions`: sessão revogável, identificador hash, expiração (ou armazenamento compatível com Worker).
- `saved_guides`: links adicionados manualmente (verificação e segurança de URLs).

Veja `backend/migrations/0001_initial.sql` (rascunho sujeito a revisão de segurança).

## Primeira prova de viabilidade antes de login real
1. Validar callback OpenID com `workers.dev` e domínio/realm.
2. Verificar elegibilidade para emissão e uso da Steam Web API key sem pagar domínio.
3. Verificar acesso ao GetOwnedGames e GetPlayerAchievements de uma conta de teste com privacidade apropriada.
4. Somente depois implementar o ciclo de sessão do desktop (link profundo, código de uso único e proteção contra replay).
