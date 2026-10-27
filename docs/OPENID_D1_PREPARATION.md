# Preparação OpenID + D1 — sem login operacional

Evolução posterior: o [protocolo interno simulado](SIMULATED_AUTH_PROTOCOL.md) exercita aprovação/código/consumo em três tabelas exclusivas da migração 0007. Reutiliza o hash deste módulo e os contratos S256 revisados, preservando o verificador e as tabelas 0006. Não liga o checkpoint real à emissão, não conecta o Tauri ao D1 e não habilita rotas. Os resultados históricos abaixo descrevem somente a preparação 0006.

Esta etapa integra módulos internos, com identidades sintéticas e transporte simulado. Não abre rotas, inicia autenticação, gera códigos, cria usuários ou emite sessões. O [Worker](../backend/src/index.ts) permanece inalterado: `/auth/*` retorna 501 e `/api/*` retorna 401, mesmo com asserções/sessões sintéticas no banco. Não há flag para habilitar um bypass.

## Base reaproveitada

O [verificador](OPENID_VERIFIER.md) continua responsável por parsing estrito, campos assinados, igualdade exata de identidade/retorno, descoberta injetada, transporte fixo `check_authentication`, prazo e frescor do nonce. Não foi duplicado nem alterado. A [migração 0005](D1_INTEGRITY.md) continua responsável pelo consumo final de tentativa/grant e histórico de emissão. Migrações 0001–0005 permanecem inalteradas.

## Componentes novos

- [0006](../backend/migrations/0006_openid_assertion_checkpoint.sql) acrescenta `auth_attempt_contexts` e `verified_openid_assertions`. Não promove dados antigos nem inventa evidência para sessões existentes.
- [D1OpenIdPreparation](../backend/src/auth/D1OpenIdPreparation.server.ts) compõe o verificador existente com consulta de nonce em D1 e gravação atômica. Recebe DB e transporte/descoberta obrigatórios de código confiável do servidor; não recebe um booleano ou resultado de verificação fornecido pelo cliente. Não há fallback para fetch global ou descoberta que simplesmente confie na URL recebida.
- [D1SessionProvenance](../backend/src/auth/D1SessionProvenance.server.ts) prepara uma consulta de leitura que nega sessões legadas e exige origem consistente e asserção registrada para o mesmo SteamID/canal. **Não está ligado às rotas e não autoriza operações HTTP.**

### Contexto e vínculo

O chamador interno fornece correlação `state`, prova opaca do navegador, método GET e URL do callback. State e prova seguem o contrato local de 43 caracteres base64url; isso valida formato, não comprova entropia. A criação futura deve usar segredos independentes de 32 bytes por CSPRNG. A prova do navegador nunca pertence à URL. Somente hashes SHA-256 são procurados/armazenados.

O contexto imutável guarda retorno e realm exatos e o hash do vínculo do navegador. Só pode ser associado a tentativa v1 ativa, não consumida. Atualização, REPLACE e exclusão/substituição direta do contexto são recusados; excluir a tentativa remove seu contexto por FK. Não há rota ou inicializador de contexto nesta etapa: os testes preparam esses registros por SQL com dados sintéticos. A implementação futura deve cadastrar contexto/tentativa atomicamente, com origem/callback fixos pelo operador e proteção de intenção/CSRF.

A preparação carrega contexto por state + prova do navegador e exige que o state esteja exatamente no retorno registrado. Não deriva origem/realm de headers do cliente. O verificador valida a URL completa e a asserção usando esse contexto. Apresentar a prova correta comprova apenas posse desse valor: **não resolve relay nem prova intenção de pareamento entre navegador e desktop (R01)**.

### Registro atômico e transições

```text
tentativa v1 ativa + contexto imutável
  → validar OpenID com dependências confiáveis
  → INSERT de asserção com retorno/binding ainda correspondentes
      → trigger confere tentativa, desafio, canal, prazos e nonce
      → trigger insere nonce único (retenção de 600 s)
  → assertion-recorded-no-session
```

É uma única instrução SQL. Qualquer erro de constraint/trigger reverte asserção e nonce juntos. O relógio D1 revalida nonce com idade menor que 300 s e futuro de até 60 s, além da tentativa ativa e não consumida. Isso protege também contra uma expiração/consumo ocorrido enquanto a verificação aguardava uma dependência.

O resultado usa `INSERT … SELECT … RETURNING attempt_hash`. Um SELECT que não encontra mais o contexto não conta como sucesso. Não se usa UPDATE de zero linhas como confirmação nem `INSERT OR IGNORE`. Contadores de alterações podem incluir triggers; não se interpreta `meta.changes == 1` como prova de inserção única.

Há unicidade durável por tentativa e nonce. O pré-check de replay é apenas uma otimização: duas chamadas podem ler “unseen”; só uma gravação vence. Mesmo removendo a linha temporária de `openid_nonces`, a asserção durável impede reaceitação. Atualização, REPLACE e exclusão do registro são bloqueados; o state não pode ser recriado após a limpeza da tentativa que originou essa asserção.

Os hashes novos e os novos nonces verificam a representação textual e em bytes, além do alfabeto hexadecimal, para recusar NUL embutido/sufixos ignorados por GLOB. Durante a autoria da 0006, esses três guards adicionais foram aplicados ao banco persistente somente com execução local, sem apagar dados. Os três constam do arquivo integral da migração; a verificação limpa/upgrade abaixo confirma que sua instalação não depende desse ajuste local anterior.

**O campo `auth_attempts.consumed_at` não é alterado pelo verificador.** O registro único reivindica a tentativa para callback; o consumo final permanece nas transições 0005: grant desktop ou sessão web. Consumir antes quebraria esses guards. A emissão futura deverá exigir a asserção correspondente e coordenar também grant/sessão, prova de posse e resposta ao cliente. Esta etapa não implementa essas transações posteriores. Um sucesso de preparação não pode ser usado como sessão, grant, token ou autorização.

Erros são códigos sanitizados, sem payloads, nonces brutos, segredos ou SQL em logs. Falha de banco nunca equivale a “unseen”. Falha de resposta após commit pode deixar a gravação feita mesmo que o chamador receba erro: negar e não emitir nada. Não há retry que transforme resultado ambíguo em sucesso; reconciliação operacional ainda exige desenho.

### Sessões antigas e isolamento

A leitura preparatória exige versão 1, correspondência de token/usuário/tentativa/grant/instante em `session_origins`, asserção do mesmo usuário/canal anterior à emissão, canal esperado, ausência de revogação, prazo absoluto e inatividade válidos no relógio D1. Não atualiza atividade nem renova sessão. A política continua **1 hora absoluta / 15 minutos de inatividade**.

Sessão v0 e sessão v1 sem asserção são recusadas, mesmo ainda válidas em tempo. Não existe backfill: tentativa já consumida/origem existente não pode ganhar evidência retroativa por este caminho. A leitura continua funcionando após limpeza das tentativas/grants temporários; a asserção e o histórico são duráveis.

SQL não comprova assinatura Steam por si só. O escritor privilegiado deve ser exclusivamente o fluxo do verificador confiável; um administrador capaz de alterar triggers/dados fica fora dessa garantia. A consulta não é middleware completo: ainda faltam extração/hash de tokens pelo servidor, CSRF por canal, logout/revogação HTTP e filtros de proprietário em todas as operações privadas. Nunca aceitar SteamID enviado pelo cliente como autorização.

## Plano Tauri posterior — nenhuma mudança nativa nesta etapa

1. Processo nativo gera `code_verifier` com 32 bytes aleatórios, mantém-no em memória e envia somente desafio S256. Usar a transformação `BASE64URL(SHA256(ASCII(verifier)))`, sem fallback plain, na futura troca **Companion ↔ backend**, inspirada no [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html). Steam OpenID não é OAuth e não fornece PKCE. O campo SQL `challenge_hash` é hexadecimal de 64 caracteres; definir conversão explícita entre os mesmos 32 bytes de digest e base64url no contrato futuro, sem aplicar hashes extras por acidente.
2. Abrir somente origem HTTPS aprovada no navegador externo, por comando nativo estrito. Steam nunca é carregada no WebView. A configuração/capacidades Tauri atual não foi ampliada.
3. Resolver R01 antes de emitir grant: encaminhar link para outra pessoa, iniciar navegador diferente e trocar contas não podem entregar sessão ao desktop de terceiros. PKCE e um cookie criado ao abrir um link não resolvem isso sozinhos. Propor confirmação de conta/destino e comprovar o pareamento independentemente.
4. Retorno fixo leva somente código curto, único e correlação. Resgate HTTPS exige verifier e tentativa pendente no processo correto; conferir S256 no servidor e consumir grant com sessão na mesma transação. Testar interceptação, handler falso, múltiplas instâncias, expiração e reuso. Não enviar verifier/token em URL, argv ou logs.
5. Token da sessão só chega ao nativo pelo corpo HTTPS e fica em cofre do usuário Windows; avaliar [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) ou Credential Manager, com API mínima e licença compatível. DPAPI no escopo de usuário não protege contra código malicioso executando como o mesmo usuário. Não usar escopo `LOCAL_MACHINE`, chave embutida, JSON aberto ou localStorage. Revisar backup, logout, falha de gravação e exclusão. React recebe somente estado sanitizado, sem token; validar [capacidades/IPC Tauri](https://v2.tauri.app/security/).

## Evidência de testes e limites

[openid-d1.test.ts](../backend/tests/openid-d1.test.ts) usa D1 emulado temporário, migrações reais e rede Steam/descoberta simuladas, com fetch global bloqueado. Exercita identidade adulterada, assinatura incompleta, retorno/provedor falsos, prova incorreta, nonce antigo/futuro/reutilizado, relógios divergentes, expiração/consumo durante verificação, rollback antes/depois da escrita do nonce, upgrade sem backfill e rollback de migração. Sessões são inseridas apenas por fixtures SQL sintéticas nos testes da consulta; o módulo não emite sessões.

Disputas locais usam chamadas independentes de serviço/D1 em paralelo, com barreira antes de gravar: dez disputam a mesma tentativa e duas disputam o mesmo nonce em tentativas diferentes. Há exatamente um vencedor em cada disputa no emulador. Os testes HTTP usam `app.request` em processo e confirmam somente a negação 501/401; não são requisições TCP a um callback funcional, nem provam concorrência entre regiões/Workers em produção. Nenhuma rota permissiva de teste foi criada no produto.

Fixtures de sessão expirada/inativa/futura e tentativa vencida preparam snapshots históricos no banco temporário, reinstalando os guards originais antes da operação testada. Não representam espera real de 15 minutos ou alteração do relógio D1 de produção. Também não se executa o verificador dentro de um Worker remoto nesses testes: Fetch/Web Crypto e compatibilidade real ainda precisam ser comprovados no ambiente autorizado.

```powershell
npm.cmd run test:backend -- backend/tests/openid-d1.test.ts
npm.cmd run check
```

O check aplica somente migrações locais e compila Worker em dry-run. Na preparação inicial, passou em TypeScript frontend/backend, ESLint, migrações e builds, com **521 testes aprovados: 209 gerais, 273 do backend (43 novos naquela etapa) e 39 Playwright**. No banco local persistente, `foreign_key_check` não retornou violações e `quick_check = ok`; os três guards de representação integral estavam presentes. Frontend, Tauri, verificador original, rotas do Worker e migrações 0001–0005 permaneceram inalterados. A revisão de arquivos não encontrou credenciais reais ou arquivos privados novos; as URLs com credenciais fictícias dos testes negativos anteriores não foram alteradas.

### Verificação adicional antes do commit

O [teste de paridade](../backend/tests/migration-parity.test.ts) cria dois estados D1 persistentes em subdiretórios temporários distintos, sem usar o estado local do projeto:

| Cenário | Verificação |
| --- | --- |
| Banco novo | Executa integralmente 0001–0006, incluindo os três guards de NUL presentes no arquivo 0006. |
| Upgrade | Prepara 0001–0005 com dois usuários sintéticos, preferências, desejos, metas, tentativas, grants, nonces, histórico e sessões v0/v1/revogada; aplica 0006 depois. Os 22 registros nas nove tabelas anteriores são preservados campo a campo. |
| Paridade | Compara todo SQL de tabelas, índices e triggers em `sqlite_master`, incluindo CHECK/UNIQUE, além de metadados PRAGMA de colunas, índices e FKs. Os schemas finais são idênticos, com onze tabelas. |
| Integridade | `quick_check = ok` e `foreign_key_check` vazio em ambos, antes e depois dos testes negativos. |
| NUL e legado | Ambos rejeitam hashes malformados de vínculo/asserção/nonce. No upgrade, quatro sessões existentes são recusadas pela consulta de proveniência, sem criar evidência retroativa. As operações inválidas não deixam dados parciais. |

Não foi necessário alterar migrações ou adaptadores nesta conferência. Acrescentou-se somente essa regressão e o registro documental. Nenhuma sessão real foi emitida: todos os registros são fixtures SQL sintéticas em bancos isolados. Essa prova permanece local, sem autenticação Steam ou garantias de produção.

Para preservar também o estado local durante o comando completo, `npm.cmd run check` foi executado em uma cópia temporária dos arquivos candidatos, byte a byte, com as dependências já instaladas disponibilizadas por junction. Assim, a etapa `backend:db:migrate` do próprio check também instalou 0001–0006 num estado novo da cópia, sem apontar para o banco original. TypeScript, ESLint, migrações e builds passaram, com **522 testes aprovados: 209 gerais, 274 do backend e 39 Playwright**. A diferença de um teste em relação aos 521 anteriores é esta regressão de paridade, sem funcionalidade nova. A comparação SHA-256 dos 21 arquivos do estado D1 original antes/depois não encontrou alterações; os arquivos de código/testes da cópia permaneceram idênticos aos revisados. `git diff --check` passou. O comando direcionado reproduz a comparação sem usar o estado do projeto:

```powershell
npm.cmd run test:backend -- backend/tests/migration-parity.test.ts
```

Não há nova dependência, conta, segredo, recurso remoto, deploy ou push. O responsável autorizou encerrar a preparação com commit local após as verificações.

## Bloqueadores e próxima tarefa

- **Críticos, abertos:** R01 pareamento resistente a relay/login CSRF; R02 descoberta real segura e compatibilidade Steam/Workers; R03 atomicidade do fluxo completo até grant/sessão, retries e falhas após commit. O avanço local não aprova os gates da [revisão](SECURITY_REVIEW.md).
- **Altos:** cofre/IPC/retorno Tauri, middleware por canal, CSRF, logout/revogação, isolamento de dados por usuário e proteção contra abuso. Nenhuma rota atual consulta/aceita a sessão por este módulo.
- **Retenção obrigatória antes de dados reais:** a asserção durável guarda SteamID/claimed ID, sem FK para tentativa/usuário para evitar cascata/reuso. DELETE está bloqueado até definir retenção/exclusão e tombstones seguros. Excluir um usuário hoje não apaga esse registro; não carregar dados pessoais reais com essa política preparatória. Revisar exclusão de conta, tentativas abandonadas e orçamento de armazenamento antes de produção.
- Comprovar cotas gratuitas, limites globais, interrupção segura, privacidade, restauração/relógio e operação sem cobrança; manter segredos só no backend. Nenhum preço/cota remoto é assumido como garantia nesta implementação local.

**Próxima tarefa recomendada:** especificar e revisar o pareamento navegador/dispositivo (R01), com vetores de relay e critérios objetivos, e depois implementar sua prova isolada com clientes simulados. Em paralelo de planejamento, decidir o perfil/resolvedor de descoberta restrito à Steam e a política de retenção; somente após essas revisões autorizar os próximos adaptadores, sem ativar login por conveniência.

Referências: [OpenID 2.0 §11](https://openid.net/specs/openid-authentication-2_0.html#verifying_assertions), [D1 Database/statement e batch](https://developers.cloudflare.com/d1/worker-api/d1-database/). A atomicidade observada foi executada no emulador; nenhuma propriedade distribuída foi inferida apenas dessas fontes.
