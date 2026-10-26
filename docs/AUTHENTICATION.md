# Arquitetura de autenticação Steam — proposta, ainda desativada

Esta especificação prepara a implementação futura. **Nenhuma resposta OpenID é aceita pelas rotas HTTP, nenhum token é emitido e nenhum usuário se autentica no backend atual.** As rotas reservadas retornam 501/401, independentemente de cookies, headers ou linhas no banco. Não há opção de configuração que habilite um login simplificado.

O [verificador OpenID isolado](OPENID_VERIFIER.md) valida formato, campos assinados, retorno, nonce, tupla de descoberta injetada e resposta check_authentication com transporte injetado. A [preparação OpenID/D1](OPENID_D1_PREPARATION.md) o compõe com contexto imutável da tentativa, consulta de replay e registro atômico de asserção/nonce. Não está ligada às rotas do Worker; nenhum resultado autoriza sessão. Descoberta real segura e integração do fluxo completo continuam pendentes; testes usam mocks, sem autenticação Steam real.

A migração 0005 reforça somente a integridade SQL: vínculos de origem únicos, consumo/revogação irreversíveis e dados legados sem promoção automática. Leia [D1_INTEGRITY](D1_INTEGRITY.md) para upgrade, exclusões e limites dos testes. A política de 1 hora absoluta/15 minutos inativa continua a mesma; alternativas desktop estão documentadas, sem alteração automática. `integrity_version = 1` não comprova login.

**Obrigatório para o futuro middleware:** negar versão legada, origem/asserção ausente ou divergente e sessão expirada/inativa/revogada, sem fallback por token existente. A consulta preparatória de proveniência está implementada e testada isoladamente, mas não há middleware HTTP que a use. Antes de habilitar login, comprovar testes HTTP negativos e emissão somente após identidade OpenID verificada. As rotas atuais negam acesso incondicionalmente.

## Responsabilidades e fluxo futuro

```text
Desktop Tauri ou navegador
  → início de tentativa vinculado ao cliente e ao navegador
  → navegador externo abre Steam OpenID oficial
  → callback HTTPS do backend verifica OpenID e antirreplay
  → web: sessão própria em cookie protegido
  → desktop: código curto, único, vinculado à tentativa e à prova de posse
      → resgate HTTPS → sessão própria no armazenamento seguro do Windows
```

Steam OpenID 2.0 autentica a identidade. Não é OAuth/OIDC, não entrega permissões extras sobre perfil privado e não fornece PKCE. A prova de posse do fluxo desktop será um mecanismo próprio do aplicativo/backend; não deve ser apresentada como funcionalidade da Steam. A chave Web API do operador é um segredo separado, usado somente no backend para consultas autorizadas.

### Início e callback OpenID

- Iniciar somente por ação explícita do usuário. Vincular tentativa ao cliente e ao navegador que iniciou o fluxo, com estado aleatório e cookie de tentativa protegido quando aplicável. O estado que passa em URL não é prova suficiente de posse.
- Usar navegador externo e páginas oficiais. Não coletar senha, Steam Guard, cookies Steam ou chave Web API dos usuários.
- Fixar realm, retorno HTTPS e provedor/endpoint oficial; não aceitar callback, destino ou endpoint de verificação arbitrário vindo do cliente. Não realizar descoberta ou fetch de URLs não confiáveis.
- Escolher e revisar uma implementação de OpenID 2.0 compatível com Workers. Verificar protocolo, campos obrigatórios/assinados, `op_endpoint`, `claimed_id`, `identity`, `return_to`, realm e `response_nonce`; rejeitar parâmetros duplicados, payloads excessivos e identidade divergente. SteamID só vem do identificador oficial validado.
- Verificar autenticidade no servidor, incluindo o mecanismo oficial `check_authentication` quando aplicável; não basta ler SteamID da URL ou receber um booleano do frontend. Não registrar payloads de callback em logs.
- Exigir nonce recente e não usado, com política de relógio/desvio definida. Consumir tentativa e registrar nonce atomicamente em D1; unicidade e atualizações condicionais precisam resistir a callbacks simultâneos. Nunca depender de read-modify-write sem condição para prevenir replay.

### Retorno para o desktop Windows/Tauri

- O desktop gera segredo aleatório forte e envia apenas seu desafio/hash na criação da tentativa. O segredo não passa pelo navegador, URL, logs ou webview; armazenamento e acesso devem ser restritos ao cliente nativo.
- Após OpenID validado, emitir apenas código aleatório curto de uso único e curta expiração. Um deep link fixo pode transportar código e correlação não secreta; nunca um bearer token duradouro. Não permitir redirecionamento para URL fornecida pelo usuário.
- Resgate requer código, prova do segredo e vínculo à tentativa original; verificar os hashes no servidor e consumir uma única vez atomicamente, junto à criação da sessão. Interceptar um deep link não deve permitir obter a sessão sem a prova de posse.
- Vincular também o contexto do navegador para impedir login CSRF/troca de conta. Não permitir que um link de tentativa de terceiros vincule automaticamente qualquer navegador ou conta ao desktop de outra pessoa. Confirmar a conta e o destino quando necessário; essa ameaça é um bloqueador de validação, não uma propriedade já resolvida pelo schema.
- Validar o comportamento de múltiplas instâncias e handlers de URI no Windows. Usar capacidades mínimas Tauri, CSP e armazenamento seguro do SO. Não pressupor que registrar um esquema de URI prova a identidade do aplicativo.

## Sessões, logout e CSRF

| Item | Política inicial proposta |
| --- | --- |
| Token | Opaco, aleatório, pelo menos 256 bits via CSPRNG. Banco guarda somente SHA-256 em hexadecimal, nunca token bruto. |
| Expiração | Absoluta de até 1 hora, inatividade de 15 minutos, relógio UTC do servidor. Checar em toda rota privada. Renovação/rotação ainda devem ser especificadas e testadas; não há renovação indefinida. |
| Revogação | `revoked_at` invalida imediatamente; logout POST revoga no banco, remove cookie/token e limpa cache privado do cliente. Não basta apagar apenas no frontend. |
| Web | Cookie `__Host-...`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sem `Domain`; não usar localStorage para bearer. Cookie de tentativa separado, curto e protegido. |
| CSRF | Para operações web com efeito: Origin/Referer estritamente verificados, token sincronizador ligado à sessão e método não GET. SameSite e CORS são camadas adicionais. Callback OpenID usa as verificações específicas de tentativa, retorno, assinatura e nonce, pois navegação de retorno não equivale a uma chamada same-origin. |
| Desktop | Sessão nativa em armazenamento seguro do Windows; requisições explícitas com autorização, sem cookies ambiente. Não aceitar identidade por `X-User-Id`, query ou corpo. |
| Isolamento | Usuário vem exclusivamente da sessão verificada. Toda operação inclui o SteamID autenticado e SQL parametrizado; IDs fornecidos pelo cliente não autorizam acesso. |

Antes de habilitar cookies em produção, comprovar origem/HTTPS corretos e política CORS por cliente. Não usar `*` com credenciais. Para Tauri, qualquer origem permitida precisa ser definida e testada; a origem isoladamente não autentica um processo nativo.

## Estruturas D1 preparadas

- `sessions`: hash do token, usuário, tipo de cliente, hash CSRF para web, criação, expiração absoluta, última atividade e revogação.
- `auth_attempts`: hash de estado e desafio, canal web/desktop, criação, expiração até cinco minutos e consumo.
- `openid_nonces`: hash único, criação e expiração até dez minutos. Validação de timestamp e tolerância de relógio ocorrerão no protocolo; TTL no banco sozinho não verifica frescor.
- `desktop_grants`: hash do código, tentativa única, usuário/desafio, expiração até 60 segundos e consumo.
- `session_origins`: histórico de emissão por tentativa/grant, ligado ao usuário e separado da limpeza temporal; sessões apontam para essa origem única. Dados anteriores a 0005 recebem versão legada e não podem gerar novas sessões.
- `auth_attempt_contexts` e `verified_openid_assertions` (0006): retorno/realm e vínculo de navegador imutáveis; registro durável único da asserção com nonce. Callback reivindica uma única tentativa nesse registro; `consumed_at` continua reservado à emissão futura via guards 0005. Veja [transições e limites](OPENID_D1_PREPARATION.md), inclusive retenção ainda bloqueadora para dados reais.

Índices de expiração permitem limpeza futura. Resgates e nonces deverão ser consumidos em operações condicionais/atômicas; uma sessão expirada/revogada não pode ser aceita porque a limpeza periódica ainda não ocorreu. As tabelas e testes SQL atuais demonstram restrições e primitivas, **não implementam o handshake, logout, middleware de sessão ou proteção CSRF operacional**.

O rascunho usa formatos de hash e prazos limitados por constraints. Revisar unicidade, transações entre consumo e emissão, limites de tentativas, limpeza, quotas D1 e estratégia de armazenamento antes de tráfego público. Nenhum token ou segredo real foi usado para preparar o schema.

## Requisitos a comprovar antes de implementar o login real

1. Para identidade OpenID: origem gratuita elegível, callback/realm HTTPS aceito pela Steam e futura prova com conta de teste autorizada. OpenID não requer a chave Web API do operador; elegibilidade/chave e visibilidade para consultas à biblioteca são requisitos separados dessa integração posterior. Não adquirir domínio ou API paga para contornar o requisito de custo zero.
2. Elegibilidade de Workers/D1 gratuitos, limites globais/por usuário, orçamento diário de consultas, prevenção de abuso e comportamento sem cobrança ao exceder cotas.
3. Política de privacidade, consentimento/pedido do usuário, países de armazenamento, retenção/exclusão e avisos exigidos pela Steam. Dados Steam não são relicenciados como MIT.
4. Compatibilidade da implementação OpenID com Workers e revisão do modelo de ameaças: assinatura/retorno falsos, SSRF, replay, corrida, sessão fixada, login CSRF, troca de conta e expiração.
5. Prova do fluxo Windows/Tauri: browser binding, interceptação do retorno, múltiplas instâncias, código expirado/reutilizado, prova de posse errada e armazenamento seguro.
6. Testes com dois usuários e identidades cruzadas em todas as rotas, revogação/logout reais, CSRF por canal, token ausente/expirado e limpeza do cliente. Testes de verdade não devem ser substituídos por auth fake para produção.
7. Migrações, recuperação, limites do D1 e revisão independente do resultado antes de habilitar o primeiro beta autenticado.

## Referências oficiais

- [Steam: OpenID e identidade](https://steamcommunity.com/dev#steam_openid).
- [OpenID Authentication 2.0](https://openid.net/specs/openid-authentication-2_0.html), especialmente verificação de respostas e nonces.
- [Requisitos para obter a identidade Steam](https://partner.steamgames.com/doc/features/auth).
- [Deep links no Tauri](https://v2.tauri.app/plugin/deep-link/) — validar o comportamento da versão adotada na prova Windows, ainda não executada.
- [Workers: secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [D1: statements preparados](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) e [D1: batch](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Veja [BACKEND.md](BACKEND.md) para executar o backend local e [STEAM_LIBRARY.md](STEAM_LIBRARY.md) para os contratos das consultas Steam.
