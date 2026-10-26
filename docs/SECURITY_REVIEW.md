# Revisão de segurança — autenticação Steam planejada

Data: 26/10/2026. Base inspecionada: commit `1f7111a07b51ec04cfb77747dea5bcb69edb3f64`.

Atualização posterior de integridade: [D1_INTEGRITY](D1_INTEGRITY.md) registra a migração 0005 e suas provas locais. As constatações abaixo descrevem a base original; R03 teve correções estruturais parciais, mas seus testes HTTP/protocolo e os gates continuam pendentes. R01/R02 permanecem críticos.

Atualização posterior do verificador: [OPENID_VERIFIER](OPENID_VERIFIER.md) registra validações e transporte isolados com dependências simuladas. É avanço parcial de R02, sem resolvedor de descoberta conectado ou consumo D1 atômico; não conclui R01/R02/R03 nem autoriza o primeiro login real.

Atualização posterior OpenID/D1: [OPENID_D1_PREPARATION](OPENID_D1_PREPARATION.md) registra a migração 0006, contexto imutável, registro atômico de asserção/nonce e consulta preparatória de sessão que nega legado/origem/asserção divergentes. Disputas e rollback foram testados em D1 emulado, sem emissão de sessões pelo módulo. R03 teve avanço parcial adicional; faltam transações até grant/sessão, falhas/retries e provas entre Workers. R01/R02 continuam críticos, sem descoberta real, pareamento aprovado ou gates autorizados. Retenção/exclusão dos novos registros duráveis precisa ser decidida antes de dados reais.

Atualização posterior do desktop: [DESKTOP](DESKTOP.md) registra Tauri 2 envolvendo somente o demo, sem permissões IPC, plugins ou autenticação. Build release, três testes Rust e conferência funcional/segurança no WebView2 foram aprovados; NSIS foi gerado sem instalação. As menções abaixo à ausência de Tauri descrevem a base original; armazenamento de sessão, retorno desktop e todos os gates de autenticação continuam pendentes.

**Parecer: NÃO autorizar ainda a primeira autenticação real com emissão de sessão.** Há bloqueadores críticos de vínculo navegador/desktop, verificação OpenID e emissão atômica. O backend atual mantém autenticação desativada; os riscos abaixo descrevem principalmente o que poderá acontecer se as rotas forem habilitadas sem esses controles. Não constituem prova de exploração do protótipo bloqueado.

A revisão original acrescentou somente este relatório, sem login, Tauri, migração, sessão, recurso remoto, deploy ou credenciais reais. Os reforços SQL posteriores estão documentados no adendo acima. As recomendações do fluxo de autenticação continuam propostas, não propriedades já comprovadas do sistema.

## 1. Escopo, evidências e limites

Foram revisados [AGENTS](../AGENTS.md), [README](../README.md), [AUDIT](AUDIT.md), [ROADMAP](ROADMAP.md), [arquitetura](ARCHITECTURE.md), [segurança](SECURITY.md), [autenticação](AUTHENTICATION.md), [backend](BACKEND.md), [integração Steam](STEAM_LIBRARY.md) e o código/configuração/testes atuais do backend.

| Evidência local | Constatação |
| --- | --- |
| [Worker](../backend/src/index.ts) | Somente health consulta D1. `/auth` e descendentes retornam 501; `/api` e descendentes, 401 incondicional. Não há verificador de sessão, emissão de token, callback ou logout operacional. |
| [Bindings](../backend/src/bindings.ts) | Reserva `DB` e segredo opcional; nenhuma rota atual lê a chave Steam. |
| [Wrangler](../backend/wrangler.jsonc) | Loopback, D1 local com UUID marcador, bindings remotos desativados, sem conta/rota pública; previews e observabilidade desativados. Isso não configura segurança de uma futura implantação. |
| [Migrações](../backend/migrations/) | Oito tabelas, validação de IDs/JSON, hashes e prazos. Não há autorização por linha nem lógica que una callback, tentativa e sessão. |
| [Testes](../backend/tests/backend.test.ts) | Cobrem bloqueios HTTP e primitivas SQL locais. Dois consumos em um batch são sequenciais; não equivalem a callbacks HTTP concorrentes com criação de sessões. |
| [Cliente Steam](../backend/steam/SteamWebApi.server.ts) | Exclusivo do servidor, sem rota ativa; não verifica OpenID. Chave Web API não autentica um usuário. |
| [Frontend](../src/) | Permanece demonstrativo; Tauri e armazenamento nativo de sessão ainda não existem. |

Não houve autenticação real, captura de resposta pessoal, teste de invasão remoto, avaliação de instalador Windows ou comprovação de comportamento distribuído do D1. Uma suíte verde prova somente os comportamentos que executa. Este relatório não certifica ausência de vulnerabilidades.

## 2. Modelo de ameaças e gravidade

Ativos: identidade Steam verificada, token da sessão do Companion, segredo temporário do desktop, integridade de tentativas/nonces/grants, dados privados por usuário e eventual chave Web API do operador. Fronteiras: React ↔ processo nativo; aplicativo ↔ navegador externo; navegador ↔ Steam/Worker; Worker ↔ D1; usuário A ↔ usuário B.

Considerar atacante com site malicioso, cliente HTTP próprio, cópia modificada do app, link copiado, capacidade de registrar o mesmo protocolo Windows e execução concorrente de requisições. Não confiar em CORS, headers de identidade, nome do executável, IP ou segredo embutido no binário. O servidor não consegue distinguir um aplicativo público legítimo de toda cópia modificada apenas por um client secret distribuído.

Crítico: possível emissão de sessão para identidade/destinatário errado ou bypass completo. Alto: roubo de sessão, exposição entre contas, SSRF ou perda de controles centrais. Médio: abuso de cotas, exposição auxiliar e disponibilidade. A classificação expressa impacto potencial; controles planejados não reduzem automaticamente o risco residual.

| ID | Gravidade e situação | Risco/evidência | Solução proposta e prova exigida |
| --- | --- | --- | --- |
| R01 | **Crítico — não resolvido** | Tentativa criada pelo atacante é enviada à vítima; a vítima entra na Steam e a sessão termina no desktop do atacante. Hash de desafio e cookie criado ao abrir o link não provam intenção de pareamento. | Especificar vínculo entre intenção no desktop, navegador e conta, com confirmação independente e teste de encaminhamento entre dispositivos. Não emitir grant enquanto isso não for comprovado. T01/T02. |
| R02 | **Crítico — não resolvido** | Aceitar SteamID de URL, assinatura parcial ou `is_valid` isolado permite identidade incorreta. Falta verificador; descoberta e discrepância de identificador ainda precisam de decisão. | Perfil estrito do provedor, implementação OpenID revisada, validações completas e testes negativos. T03–T07. |
| R03 | **Crítico — não resolvido** | Duas requisições podem consumir/reutilizar tentativa ou grant e criar sessões extras. Os testes atuais não cobrem emissão real nem disputa entre Workers. | Especificar transições condicionais e transações que não emitam sessão se o consumo falhar; testar concorrência, falhas e retries. T08/T09. |
| R04 | Alto — pendente | SteamID recebido no corpo/query, cache compartilhado ou busca por AppID sem dono podem expor dados de B a A. FK não implementa autorização. | Contexto autenticado obrigatório e filtros de proprietário em toda operação; matriz de dois usuários. T10. |
| R05 | Alto — pendente | Deep link interceptado/falsificado ou sessão em URL, argv, console, localStorage/IPC permite roubo. Tauri ainda não existe. | Código de retorno sem poder de autenticação isolado, prova nativa, resgate HTTPS e armazenamento do SO; testar app falso e IPC. T02/T11/T12. |
| R06 | Alto — pendente | Sessão expirada/revogada ainda aceita; logout apenas visual; fixação ou renovação infinita. | Token novo do servidor, consulta autoritativa por requisição, prazos e revogação efetivos. T13/T14. |
| R07 | Alto — pendente | CSRF em início/confirmação/logout/escritas ou troca silenciosa da conta já conectada. | Rotas com efeito protegidas por canal, ação explícita, confirmação de troca e proibição de callback sem tentativa. T01/T15. |
| R08 | Alto — pendente | Redirecionamento livre, host falso ou descoberta controlada pelo cliente causa phishing, exfiltração ou SSRF. | Destinos fixos, comparação estrutural, descoberta restrita e redirects controlados. T04/T16. |
| R09 | Alto — pendente | XSS/IPC amplo permite usar a sessão, mesmo sem ler um token HttpOnly. Tela Steam falsa captura credenciais. | Navegador externo, conteúdo local, CSP, escape de conteúdo e capacidades/IPC mínimos; revisão Windows. T11/T17. |
| R10 | Alto — pendente | Segredo no bundle, callback em log ou acesso excessivo de colaboradores compromete contas/dados. | Bindings secretos só no backend; mínimo privilégio, rotação, logs sanitizados e inspeção de artefatos. T12/T18. |
| R11 | Médio — pendente | Spam de tentativas/verificações/polling esgota Workers/D1 e impede login/logout. Contador em memória não é global. | Limites persistentes, tamanhos e deadlines, índices, retenção curta e interrupção segura na cota. T19/T20. |

**Não há mitigação implementada para habilitar login real nesta revisão.** A negação incondicional atual evita expor esse fluxo incompleto; removê-la deve exigir os critérios da seção 11.

## 3. Requisitos oficiais e perfil proposto do provedor

### 3.1 Constatações das fontes

A Valve documenta Steam como provedor OpenID e retorno de SteamID64. As duas páginas oficiais divergem no identificador: [Steam Community](https://steamcommunity.com/dev#steam_openid) mostra `https://steamcommunity.com/openid/id/<steamid>`, enquanto [Steamworks](https://partner.steamgames.com/doc/features/auth#website) mostra `http://steamcommunity.com/openid/id/<steamid>`. Não normalizar um esquema no outro antes de verificar a asserção. A divergência é documental; o formato efetivo não foi observado nesta etapa.

O fluxo OpenID documentado não inclui chave Web API. Assim, **não fazer a emissão de chave de dados um pré-requisito do login de identidade**. Consultas futuras à biblioteca são outra integração, com elegibilidade/segredo próprios. Essa distinção refina o item 1 dos bloqueadores de [AUTHENTICATION](AUTHENTICATION.md); não pressupõe acesso a biblioteca privada ou prova de propriedade de jogos.

Resumo normativo de [OpenID 2.0, §§9–11](https://openid.net/specs/openid-authentication-2_0.html): usar namespace 2.0; a requisição pode selecionar a identidade no provedor com `identifier_select`. Na resposta, conferir retorno, descoberta, nonce e assinatura. O retorno deve corresponder a esquema, autoridade e caminho recebidos, preservando seus parâmetros. A descoberta confirma a autoridade do provedor para o identificador; selecionar a identidade no provedor não dispensa essa etapa. Campos assinados incluem `op_endpoint`, `return_to`, `response_nonce`, `assoc_handle` e, presentes, `claimed_id`/`identity`. Sem associação armazenada, a verificação direta copia os campos da resposta, alterando `openid.mode` para `check_authentication`; `is_valid` integra uma resposta Key-Value, não JSON. Essa verificação sozinha não substitui os demais controles.

### 3.2 Decisões propostas do Companion, sujeitas a validação

| Aspecto | Política proposta |
| --- | --- |
| Início | `checkid_setup`, namespace `http://specs.openid.net/auth/2.0` e identidade/claimed ID `http://specs.openid.net/auth/2.0/identifier_select`. Sem fallback 1.1. |
| Origem/callback | Uma origem HTTPS gratuita aprovada e callback fixo; realm configurado pelo operador. Nunca construir esses valores a partir de `Host`, `Forwarded`, `X-Forwarded-Host`, corpo ou query não confiáveis. |
| `return_to` | Registrar o valor exato por tentativa; incluir correlação opaca. Comparar com a tentativa e com a URL recebida, sem remover parâmetros de segurança ou comparar só prefixos. |
| Provedor | Usar `https://steamcommunity.com/openid/` como ponto documentado de configuração; resolver/pinar o endpoint efetivo de login/verificação por descoberta oficial revisada. Não adivinhar equivalência entre `/openid`, `/openid/` e `/openid/login`. |
| Identidade | Exigir identificador Steam canônico e identidade compatível; SteamID tratado como string, nunca `Number`. Não aceitar domínio parecido, userinfo, porta extra, fragmento, query, path extra ou encoding ambíguo. Resolver a política HTTP/HTTPS antes de emitir sessão. |
| Descoberta | Escolher biblioteca/perfil que cumpra o protocolo e funcione no Workers. Limitar leitura a hosts/caminhos oficiais previamente aprovados; sem fetch arbitrário do callback. Parser XML sem entidades externas/DTD; limites de bytes e redirects. Regex mais endpoint fixo não devem ser apresentados como implementação completa da descoberta. |
| Transporte de verificação | HTTPS, endpoint fixo, POST form, deadline proposto de 8 s, resposta até 16 KiB; sem cookies ambiente. Não seguir redirects automaticamente para destinos não aprovados. Timeout, corpo malformado ou falha D1 negam acesso. |
| Entrada | Proposta inicial: callback até 16 KiB e 32 campos, campos individuais até 4 KiB; rejeitar duplicatas, conflitos query/body e dupla decodificação. Medir compatibilidade antes de congelar limites. Não reconstruir campos assinados de forma que altere bytes/valores. |
| Extensões | Não solicitar e-mail, senha, cookies ou dados de perfil extras para criar sessão. Não usar extensão não verificada como identidade. |

Não foi selecionada uma biblioteca OpenID. Avaliar manutenção, licença, dependências, suporte a Fetch/Web Crypto, parser, descoberta, redirects e vetores adversariais. Não escrever um validador parcial para contornar incompatibilidade. Se nenhuma alternativa satisfizer custo e requisitos, a etapa continua bloqueada.

## 4. Fluxo completo proposto, ainda não autorizado

As rotas a seguir são nomes de contratos futuros; hoje permanecem bloqueadas. A confirmação entre navegador e desktop no passo 4 é uma lacuna crítica, não um mecanismo já definido.

```mermaid
sequenceDiagram
    actor U as Usuário
    participant UI as React local
    participant N as Tauri nativo
    participant B as Navegador externo
    participant W as Worker Hono HTTPS
    participant S as Steam OpenID
    participant D as D1
    U->>UI: Entrar com Steam
    UI->>N: Solicitar login por comando restrito
    N->>N: Criar segredo temporário e contexto local
    N->>W: POST tentativa: desafio, sem segredo
    W->>D: Registrar tentativa limitada e expiração
    W-->>N: Correlação e URL fixa do backend
    N->>B: Abrir URL permitida
    B->>W: Abrir início e confirmar intenção
    Note over N,W: BLOQUEADOR: comprovar vínculo navegador/desktop
    W-->>B: Cookie de tentativa e redirecionamento Steam
    B->>S: Login somente no domínio oficial
    S-->>B: Retorno OpenID
    B->>W: Callback HTTPS
    W->>W: Validar tentativa, retorno, descoberta e campos
    W->>S: Verificação direta da asserção
    S-->>W: Resultado de verificação
    W->>D: Consumir tentativa/nonce e criar grant atomicamente
    W-->>B: Página local sem terceiros e retorno fixo com código
    B->>N: Código e correlação, sem token de sessão
    N->>N: Exigir tentativa pendente e confirmação da conta
    N->>W: POST resgate HTTPS: código e prova nativa
    W->>D: Consumir grant e criar sessão atomicamente
    W-->>N: Token somente no corpo da resposta TLS
    N->>N: Guardar token no SO; apagar segredo temporário
    N-->>UI: Estado autenticado, sem token
```

1. O clique explícito no app inicia uma tentativa. O processo nativo gera pelo menos 32 bytes aleatórios por tentativa, guarda-os em memória restrita e envia somente um desafio derivado. O segredo de prova não é client secret nem recurso PKCE fornecido pela Steam.
2. O backend cria correlação aleatória, prazo de cinco minutos e vínculo ao desafio/canal. Nenhum SteamID vindo do cliente define a identidade. Limitar tentativas antes de alocar registros ou consultar a Steam.
3. O nativo abre exclusivamente o endereço HTTPS configurado usando o navegador externo. Não abrir URL arbitrária recebida de deep link; não permitir login em WebView/iframe do Companion.
4. **Resolver R01:** vincular intenção no desktop ao contexto do navegador antes de autorizar a continuação. Cookie `__Host-...` curto, confirmação de destino e comparação de informação nos dois canais são candidatos, não uma prova suficiente por si sós. O servidor deve proteger a confirmação contra CSRF; o app deve rejeitar retorno sem tentativa pendente.
5. O backend inicia OpenID com valores registrados. Cancelamento da Steam, tentativa expirada ou ausência do vínculo encerra o fluxo sem sessão. Não aceitar resposta espontânea fora de tentativa iniciada pelo app.
6. O callback verifica o perfil da seção 3, o vínculo, os prazos e a autenticidade. Só então extrai a identidade e planeja a gravação. Não criar usuário nem revelar dados a partir de SteamID ainda não verificado.
7. Uma transição indivisível aceita uma única asserção/tentativa, registra nonce, associa o usuário verificado e cria um grant de até 60 s. Nenhum erro parcial deixa autorização reaproveitável.
8. Retorno ao aplicativo leva somente código aleatório de alta entropia e correlação. “Curto” significa validade curta; não usar um PIN de poucos dígitos como segredo de resgate. A página intermediária não carrega analytics, imagens remotas ou scripts de terceiros e usa `no-store`, `no-referrer`, CSP própria e proteção contra framing. A CSP JSON atual precisa de revisão se houver HTML.
9. O processo nativo valida o retorno, a tentativa pendente e a conta que será conectada. Não substituir conta já conectada silenciosamente. Resgate HTTPS exige código, correlação e prova do segredo; não enviar token antigo a destino vindo do retorno.
10. O servidor cria token novo após o consumo condicional do grant, grava somente hash e o entrega ao nativo por resposta TLS. Falha de persistência segura no cliente encerra a sessão/requer revogação; não há fallback em texto puro. O React recebe somente estado/identidade necessários à tela.

### 4.1 Por que prova de posse não resolve R01 sozinha

Ataque a reproduzir: o atacante cria tentativa com seu próprio desafio, envia a URL à vítima e induz o login. A asserção Steam da vítima pode ser válida, e o atacante conhece a prova de posse da tentativa. Portanto, exigir essa prova no resgate protege contra interceptar um retorno alheio, mas não impede a vítima de autorizar a tentativa do atacante.

O desenho ainda precisa explicar como o usuário confirma **seu app e seu dispositivo**, evitando associação automática ao primeiro navegador que abrir a URL. Avaliar confirmação cruzada com informação originada na instância local, limites de uso e experiência que recuse tentativas encaminhadas sem intenção independente. Um código de comparação exibido só no navegador, `state` na URL, CORS ou “cliquei em continuar” não bastam para declarar o risco resolvido. Revisão adversarial deve documentar o limite residual contra relay/phishing; sem desenho e evidência aprovados, manter R01 crítico e o login bloqueado.

## 5. Recepção do resultado no Windows/Tauri 2

A documentação oficial informa que links no Windows podem chegar como argumento a um novo processo e recomenda integração com single-instance para eventos na instância existente. Também alerta para links disparados manualmente. Fonte: [Tauri Deep Linking](https://v2.tauri.app/plugin/deep-linking/). O link antigo `/plugin/deep-link/` dos documentos anteriores não foi acessível nesta revisão; usar o endereço atualizado.

| Opção | Avaliação e decisão proposta |
| --- | --- |
| Esquema customizado fixo | Candidato inicial, sem domínio comprado. Outro processo pode registrar/interceptar o esquema; tratar URL e argv como entrada hostil. Só transportar código inútil sem prova nativa. Testar instalação, associação e concorrência. Não é prova da identidade do binário. |
| Loopback temporário | Alternativa a avaliar se necessário; bind somente em loopback, porta/contexto efêmeros, regras anti-CSRF/DNS rebinding e fechamento após uso. Callback Steam continua no Worker. Exige prova Windows e configuração de redirect estrita; não é fallback automático. |
| Polling HTTPS nativo | Evita depender da entrega do deep link, mas mantém R01 e pode consumir cotas. Somente com prova de posse, limites e ausência de sessão/identidade em polling não autorizado. Não ativar duas opções sem revisar a superfície adicional. |

Recomendação provisória: testar esquema fixo com single-instance e prova de posse. Escolha final pendente de R01 e T02/T11. Validar esquema/host/path exatos, tamanho, campos únicos e allowlist; não executar URI como comando de shell. Retorno de outra tentativa, app recém-aberto sem contexto pendente ou argumento com payload estranho deve ser rejeitado. Não registrar argv completo, código, callback ou segredo.

Manter resgate e chamadas autenticadas no processo nativo, com URL de API fixa. Não criar IPC genérico “fetch qualquer URL com Authorization” ou comando para ler token. Definir comandos por caso de uso, janelas autorizadas e capacidades mínimas. O token não deve alcançar JavaScript, devtools, clipboard, arquivo de configuração ou URL.

## 6. Sessões, CSRF, revogação e logout

Política proposta do Companion, ainda sem implementação. Princípios gerais: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) recomenda proteção do transporte, armazenamento e ciclo de vida; cookies não tornam uma aplicação imune a XSS. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) trata separadamente operações com credenciais ambiente e início de login. Os números abaixo são escolhas iniciais do projeto.

| Item | Política proposta e limite |
| --- | --- |
| Sessão | Token opaco gerado pelo servidor com pelo menos 256 bits; SHA-256 no banco. Não aceitar token escolhido pelo cliente nem reutilizar state/grant como sessão. Não usar JWT autossuficiente que ignore revogação no D1. |
| Desktop | Token no armazenamento seguro do Windows, acessível apenas ao nativo. Avaliar DPAPI por usuário ou Credential Manager com biblioteca revisada. Se inacessível, exigir novo login; sem chave embutida ou JSON como alternativa. |
| Limite da proteção local | [Microsoft DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) vincula tipicamente a proteção ao usuário/computador. Isso não isola de todo malware executando como o mesmo usuário, administrador ou processo comprometido. Documentar esse risco residual. |
| Prazos | Até 1 h absoluta e 15 min de inatividade; UTC e relógio do servidor. Nesta primeira versão planejada, sem refresh token ou extensão além do prazo absoluto. Nova autenticação ao vencer. Atualização de atividade não pode ressuscitar sessão expirada/revogada. |
| Autorização | Conferir hash, usuário, revogação e ambos os prazos em cada requisição; falha de consulta nega acesso. Não aceitar sessão por presença de linha, cookie ou header bem formado. |
| Consistência | Inicialmente consultas de segurança no primário e sem cache de sessão. Não habilitar réplicas sem revisar frescor de revogação; sessão SQL D1 não é sessão de usuário. A API [D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession) distingue essas opções. |
| Logout | POST autenticado e idempotente, revogação no servidor antes da confirmação; limpar token/cache/tentativas locais. Logout do Companion não desconecta a conta no site/cliente Steam. |
| Sem rede/D1 indisponível | Apagar acesso local e informar que a revogação remota não foi confirmada; não anunciar logout global concluído. Definir recuperação segura para tentar revogar, ou depender do prazo curto com risco explícito; token roubado pode sobreviver até expirar. |
| Troca de conta | Revogar sessão anterior e limpar cache com dono antes de apresentar dados da nova conta; confirmação explícita. Nunca reaproveitar token ou wishlist de outra identidade. |
| Cliente web futuro | Fora do primeiro login desktop. Se adicionado, cookie `__Host-...`, Secure/HttpOnly/SameSite=Lax/Path=/, sem Domain; token CSRF ligado à sessão e Origin verificado em operações com efeito. Não colocar bearer em localStorage. |

Para as páginas no navegador deste fluxo desktop, o cookie de tentativa também é credencial ambiente: início efetivo, confirmação e cancelamento exigem proteção CSRF. GET pode exibir confirmação; não deve sozinho conceder autorização. O callback é exceção protocolar de navegação, protegido por tentativa, vínculo, retorno e asserção, e não por uma exigência ingênua de Origin same-origin no retorno da Steam. Separar autenticação nativa por header de futuras rotas web por cookie; rejeitar credenciais conflitantes e não fazer fallback entre canais.

Revogação confirmada deve impedir qualquer nova autorização iniciada depois do commit. Uma operação já em curso pode competir com logout: escritas sensíveis devem revalidar sessão na mesma transação ou ter semântica de corrida explícita e testada. Leitura em réplica/cache não pode prolongar validade. [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) precisa de revisão antes de mudar essa política.

## 7. Dados e transações: lacunas concretas do esquema

O esquema existente é fundação, não protocolo. Não alterá-lo nesta revisão. Antes de login real, projetar migrações incrementais para as seguintes lacunas:

- `auth_attempts` não guarda vínculo verificável ao navegador, retorno/realm exatos nem estado intermediário de confirmação. Há apenas canal/desafio/prazo/consumo. Definir se as constantes são versionadas na tentativa para resistir a mudanças de configuração durante o login.
- `desktop_grants` tem FK/uniqueness, mas não garante que desafio, dono, canal e prazo correspondem à tentativa autorizada. `consumed_at` não impede leitura/resgate por si só. Grant nunca deve sobreviver à validade efetiva que o emitiu.
- `sessions` limita formato e duração, mas não demonstra geração aleatória, autenticação, política de inatividade ou relação única com um resgate. Decidir vínculo auditável de origem para impedir dupla emissão e facilitar revogação.
- `openid_nonces` garante unicidade enquanto a linha existe. Proposta: aceitar timestamp entre agora − 5 min e agora + 60 s; reter nonce pelo menos 10 min desde aceitação e testar fronteiras. Não apagar nonce enquanto a mesma asserção ainda puder ser aceita. TTL no banco não executa limpeza sozinho.
- Tempos do cadastro original são TEXT e os de auth são segundos inteiros. Definir conversões e política única no código; não comparar unidades diferentes silenciosamente.

**R03: `batch()` sozinho não basta.** A documentação [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) descreve transações sequenciais e rollback em erro. Um UPDATE que afeta zero linhas não é necessariamente um erro: um INSERT seguinte, incondicional, ainda pode criar sessão. Verificar o resultado apenas depois do commit é tarde demais.

Projetar duas transações distintas: (a) tentativa válida + nonce inédito → consumo da tentativa e grant; (b) grant válido + prova correta → consumo e uma sessão. Toda gravação consequente precisa depender da condição vencedora dentro da operação indivisível. Provar também que uma segunda asserção, com nonce diferente para a mesma tentativa, não cria outro grant/sessão. Não propor BEGIN/COMMIT em chamadas independentes sem suporte confirmado do runtime.

Verificação Steam é externa e não fica dentro da transação D1. Races entre essa resposta e a gravação devem falhar de modo fechado. Se a gravação ocorrer e a resposta TLS se perder, não reemitir sessão ao reapresentar código consumido; inicialmente exigir nova tentativa. Não guardar token bruto para facilitar retry. Limpeza de expirados deve ser limitada, indexada e separada da decisão de validade.

## 8. Isolamento entre usuários

Invariantes propostos, com base no princípio de autorização por objeto da [OWASP IDOR](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html):

1. Middleware único deriva um contexto autenticado somente da sessão válida; handlers privados não recebem identidade confiável de query, corpo, header de proxy ou frontend.
2. Toda consulta de preferências, metas, desejos, exportação e cache privado inclui proprietário autenticado e parâmetros SQL. Atualização/exclusão usa dono + ID do recurso no mesmo WHERE. JOIN, paginação, bulk e tarefas futuras obedecem à mesma regra.
3. Chaves/IDs conhecidos não concedem acesso. Tentativa de acessar objeto alheio não revela sua existência; padronizar resposta, inclusive erros e contagens. Ausência de sessão retorna 401.
4. Cache privado é particionado por identidade e descartado em logout/troca; nenhuma resposta personalizada usa cache público. Perfil Steam público não torna preferências do Companion públicas.
5. Uma conta autenticada não autoriza consultar qualquer biblioteca Steam arbitrária. O backend deve derivar a identidade da própria sessão e respeitar privacidade; OpenID não é autorização para ler dados privados da Steam.
6. O binding DB tem acesso amplo: SQLite/FK não oferecem aqui uma barreira por usuário que substitua o código. Criar interfaces de repositório que exijam contexto autenticado, revisar todas as rotas e manter testes cruzados de A/B como bloqueio de regressão.

A meta é impedir acesso cruzado dentro dessas fronteiras. Não prometer isolamento absoluto diante de comprometimento do operador, Worker, banco ou SO; esses cenários exigem resposta a incidente e revogação.

## 9. Segredos, redirecionamentos, privacidade e custo zero

Segredo do operador, se consultas de dados forem futuramente autorizadas, somente em binding secreto Workers. `.dev.vars` privado local fica ignorado; exemplo continua vazio. Nunca colocar em `vars`, `VITE_*`, bundle, URL ou configuração Tauri. A [Cloudflare](https://developers.cloudflare.com/workers/configuration/secrets/) distingue secrets de variáveis públicas; o código autorizado a ler o binding ainda pode vazá-lo, portanto exige revisão. Separar acesso de colaboradores, rotação e resposta a incidente. Não há necessidade de novo segredo estático distribuído ao desktop para o fluxo proposto.

Redirecionamentos usam uma allowlist pequena de destinos completos configurados. Não aceitar `next`, realm, endpoint ou URI de resgate livres; rejeitar userinfo, portas inesperadas, domínio com sufixo parecido, `//host`, barras invertidas, encoding duplo e parâmetros repetidos. A orientação geral de evitar redirects controlados por entrada está em [OWASP Redirects](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html). Aplicar controles tanto no Worker quanto no nativo.

Não registrar URL/query de callback, argv, Cookie, Authorization, provas ou token em logs/traces/crash reports. Testar também logs automáticos da plataforma, debug local, ferramentas do navegador e relatórios do instalador; ausência de `console.log` no handler não basta. Registrar, quando indispensável, apenas código de evento e correlação não reversível, com retenção curta definida. Identidade e preferências reais exigem política de privacidade, localização/retenção/exclusão de dados e consentimento antes do teste autorizado. Não coletar e-mail, IP persistente ou avatar para habilitar login por conveniência.

### Limites e disponibilidade

Na documentação consultada, [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) inclui 100.000 requisições/dia e 10 ms de CPU por invocação; [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) inclui 5 milhões de linhas lidas/dia, 100.000 escritas/dia e 5 GB totais. D1 bloqueia consultas ao exceder limites diários. Esses números são referência da revisão, não garantia de capacidade futura; medir CPU do verificador e custo real das consultas/índices.

O plano Free deve ser confirmado antes de qualquer futura implantação autorizada; não habilitar serviços pagos nem upgrade automático. [Limites Workers](https://developers.cloudflare.com/workers/platform/limits/) distinguem fail-open e fail-closed em rotas: autenticação nunca pode ser contornada ao atingir cota. Preferir origem da API sem backend alternativo acessível; indisponibilidade não autoriza sessão ou dados.

Proposta operacional: orçamento conservador para tentativas globais e por origem confiável, por tentativa e por sessão; TTL e limpeza indexada; limites de bytes, tempo e concorrência antes de chamadas caras. Contador por isolate é insuficiente; definir estratégia persistente compatível com D1 e medir também o custo de negar spam. IP compartilhado não é identidade, e headers de IP não são confiáveis no emulador. Não adicionar produto pago para rate limiting como requisito implícito.

Na cota ou indisponibilidade: negar novas autorizações, não recorrer ao demo como sessão autenticada e informar limitação sem dados internos. Reservar capacidade para revogação, sem prometer logout remoto se D1 estiver indisponível. TLS/subdomínio gratuito, cotas e política do operador continuam pendentes; nenhuma conta ou infraestrutura foi criada nesta análise. Se CPU/limites inviabilizarem os controles, manter login desativado e revisar arquitetura sem contratar upgrade.

## 10. Matriz mínima de testes antes de ativar o login

Todos os casos abaixo estão **planejados, não comprovados pela suíte atual**. Primeiro usar OP simulado controlado e dados sintéticos no ambiente de teste isolado, sem bypass configurável no produto. Servidor falso nunca deve ser aceito pela configuração de produção. Provas que dependem de Windows/HTTPS/Steam ficam para uma etapa posterior explicitamente autorizada.

| Teste | Cenário e critério objetivo de aprovação |
| --- | --- |
| T01 — intenção/relay | Atacante inicia em A e encaminha URL para B; B tem conta diferente e pode estar já logado. Não emitir sessão de B para A nem trocar conta silenciosamente. Documentar exatamente o controle que impede isso; cookie recém-criado sozinho reprova. |
| T02 — retorno interceptado | Processo rival registra esquema/recebe código, código é copiado e replayado de outro cliente; sem segredo nativo correto, zero sessão. Retorno só é aceito pela tentativa local original. |
| T03 — integridade OpenID | Alterar individualmente cada campo de identidade/retorno/provedor/assinatura, retirar campos assinados obrigatórios, usar versão/modo inesperados; todos falham sem criar usuário/sessão. Não aceitar `is_valid:true` forjado por endpoint externo. |
| T04 — parser/URL | Duplicatas, case, percent encoding, dupla decodificação, userinfo, domínio parecido, fragmento, porta e host/proxy falso; zero autorização e zero fetch fora da allowlist. |
| T05 — descoberta | Identificador cujo provedor/serviço/identidade descobertos divergem; XML malicioso, DTD, redirect a IP privado ou outro host; rejeitar antes de confiar. Vetores aprovados para formato oficial escolhido passam. |
| T06 — falhas do fornecedor | Resposta Key-Value duplicada/malformada, ns incorreto, falso, erro HTTP, timeout e redirect inesperado; nenhuma sessão e nenhum segredo em logs. Cancelamento é estado distinto de sucesso. |
| T07 — nonce/tempo | Duplicado, velho, futuro além da tolerância, timestamp inválido e limites exatos. Reapresentar antes/depois da limpeza não permite duas aceitações. Relógio do cliente não altera validade. |
| T08 — disputa | Disparar pelo menos 20 callbacks e 20 resgates concorrentes por tentativa, com mesmo nonce e nonces distintos. No máximo um grant e uma sessão por fluxo; nenhuma transferência de dono/desafio. Executar em conexões independentes, não só um batch sequencial. |
| T09 — falhas parciais | Falhar D1 antes/depois de cada gravação, consumo zero, violação de constraint e resposta perdida após commit. Não deixar grant aberto ou sessão extra; nova tentativa recupera sem reutilizar código consumido. |
| T10 — dois usuários | A tenta ler/alterar/apagar/exportar dados de B por query, corpo, path, headers, JOIN, paginação, cache e bulk. Zero conteúdo/efeito/contagem de B. B permanece intacto; sem sessão sempre 401. |
| T11 — Windows/IPC | App parado/aberto, duas instâncias, argumento manual, tentativa inexistente, retorno tardio e binário rival. JavaScript e janela remota não conseguem obter token nem fazer requisição autenticada a host arbitrário. |
| T12 — armazenamento/vazamento | Token ausente de bundle, URL, argv, console, clipboard, localStorage e arquivo em claro. Falha do cofre impede persistência insegura. Token de usuário Windows diferente não é recuperável pelo caminho escolhido. |
| T13 — ciclo da sessão | Token inválido/antigo/escolhido pelo cliente negado; nos limites absoluto/inatividade exatos negar; nova sessão diferente; atualização concorrente não revive sessão. |
| T14 — logout/revogação | Após confirmação de revogação, novas requisições falham em clientes/locais distintos. Offline e D1 indisponível não reportam revogação confirmada; testar corrida com escrita e limpeza local. |
| T15 — CSRF/canais | Origem ausente, `null` e hostil, form POST, cookie sem token CSRF, header forjado e conflito cookie/bearer. Nenhum efeito protegido; navegação legítima de retorno Steam continua possível pelo controle protocolar. |
| T16 — destinos | Injetar `next`, callback, realm, esquema, porta, caminho e endpoint; não abrir destino externo não aprovado nem receber credencial em destino refletido. |
| T17 — phishing/XSS | Login só no navegador externo; dados de identidade/erro escapados. Conteúdo remoto não acessa IPC privilegiado. Reavaliar CSP da página de confirmação e scripts permitidos. |
| T18 — segredos/logs | Capturar logs/traces e artefatos com marcadores sintéticos; nenhum token/prova/cookie/callback bruto. Testar configuração de produção, preview e debug; rotação/revogação de segredo do operador não vaza em erro. |
| T19 — abuso/cota | Tentativas, payloads e polling além do orçamento recebem negação sem alocação ilimitada; quota/CPU/DB em falha nunca habilitam auth ou origem alternativa. Contadores funcionam entre instâncias. |
| T20 — recuperação/retenção | Migração com dados legados, limpeza parcial, reinício e restauração não reativam grant/sessão revogada. Definir retenção e recuperação; tokens anteriores a restauração não podem recuperar validade silenciosamente. |

Cada execução futura deve registrar ID, ambiente/versões, resultado e evidência sanitizada. Casos negativos devem conferir também ausência de gravação e chamadas proibidas; observar apenas status HTTP é insuficiente. Nenhum teste com segredo/conta real deve gravar payload pessoal no repositório.

## 11. Critérios para autorizar a primeira autenticação real

### Fase A — antes de qualquer sessão Steam real

| Gate | Evidência exigida | Situação nesta revisão |
| --- | --- | --- |
| G1 — desenho | R01 resolvido por protocolo/experiência revisados, com T01/T02 reproduzidos e limite de relay explicitado; escolha de retorno Windows aprovada. | **Bloqueado** |
| G2 — verificador | Biblioteca/perfil Workers e descoberta revisados, valores oficiais fixados, política de identificador documentada; T03–T07/T16 aprovados. | **Bloqueado** |
| G3 — atomicidade | Migrações incrementais e transições demonstram invariantes; T08/T09 e revogação/consistência passam no D1 emulado com disputas reais. | **Bloqueado** |
| G4 — acesso e cliente | T10–T15/T17/T18 passam; armazenamento/IPC Windows comprovados, zero token no frontend e isolamento de duas identidades sintéticas. | **Bloqueado** |
| G5 — operação sem custo | Origem HTTPS gratuita elegível, plano Free confirmado, quotas e fail-closed medidos, abuso/retenção/recuperação definidos; T19/T20 aprovados. Nenhum serviço pago obrigatório. | **Bloqueado** |
| G6 — autorização humana | Política de privacidade mínima e roteiro do ensaio revisados; responsável autoriza explicitamente infraestrutura e uso de conta de teste sob seu controle. Segredos não passam por chat/repositório. | **Não solicitado nesta etapa** |

Antes da sessão real, nenhum risco crítico/alto relacionado à emissão/acesso pode ficar sem solução e evidência correspondente. Uma aceitação genérica de risco ou o número total de testes não substitui esses gates.

### Fase B — ensaio controlado posterior, com autorização separada

Não exigir “login real já passou” como prova anterior ao primeiro ensaio. Quando houver lacuna que só a Steam real possa esclarecer, autorizar primeiro **observação controlada sem emissão de sessão**, com minimização de dados e gates pertinentes cumpridos. Fixar o formato/provedor/retorno efetivos antes de habilitar emissão; não alargar parser automaticamente diante de uma resposta inesperada.

Para a primeira sessão: uma conta de teste controlada, sem importar biblioteca nem integrar outras APIs, sem público convidado; ambiente de ensaio isolado, rollback para rotas bloqueadas e revogação imediata após a prova. Deve ser possível comprovar origem/retorno, identidade, uma única sessão, armazenamento seguro, logout e negação após revogação. Se falhar, interromper e não flexibilizar validação.

Antes do beta, repetir os vetores pertinentes no ambiente autorizado, provar concorrência/consistência do D1 implantado e Windows instalado, e revisar o resultado com outra pessoa qualificada. Não tratar essa revisão independente como já realizada ou como serviço pago obrigatório. Na ausência de revisão e evidências, manter o beta bloqueado.

## 12. Decisões pendentes e resultado desta etapa

Pendências explícitas: protocolo contra relay entre navegador/dispositivo; biblioteca OpenID e descoberta; formatos oficiais efetivos e realm/subdomínio gratuito; mecanismo de retorno e cofre Windows; transações e vínculo único de emissão; política de logging/retenção/recuperação; limites distribuídos compatíveis com as cotas. Nenhuma delas é resolvida por instalar Hono, definir um schema ou registrar um protocolo URI.

**Críticos ainda abertos: R01, R02 e R03.** A recomendação permanece manter autenticação desativada. O próximo escopo deve tratar esses bloqueadores antes de implementar login conectado; este relatório não autoriza deploy nem uso de conta/credencial real.

Validação de regressão executada nesta revisão: `npm.cmd run check` **aprovado**, com TypeScript do frontend/Worker, ESLint, migrações D1 locais sem pendências, **154 testes gerais + 40 testes de backend = 194 testes aprovados**, build React e build Worker somente em dry-run. Não houve upload/deploy. Nenhum teste novo foi implementado: T01–T20 continuam como trabalho planejado e G1–G6 não foram aprovados por esse resultado.
