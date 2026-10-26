# Integridade D1 — revisão e migração 0005

Esta etapa reforça somente o esquema e os testes locais. **Não existe login OpenID, emissão HTTP de sessões, autorização privada ou deploy.** `integrity_version = 1` significa que a linha foi criada sob as novas regras SQL; não comprova autenticação Steam ou consentimento.

## Problemas confirmados e hipóteses ajustadas

O pedido descreve preocupações da revisão Gemini, mas seu parecer integral não foi fornecido nem encontrado no repositório. A tabela avalia as hipóteses descritas e o código observado, sem atribuir ao Gemini recomendações textuais que não recebemos.

| Hipótese | Resultado da inspeção | Decisão |
| --- | --- | --- |
| Uma tentativa pode gerar vários grants | Já havia `UNIQUE(desktop_grants.attempt_hash)` em 0003. Isso sozinho não vincula sessões e deixa de registrar história após limpeza. | Preservar a restrição existente e acrescentar histórico de emissão e unicidade por origem. Não declarar corrigido um UNIQUE que já existia. |
| A mesma origem pode gerar várias sessões | Confirmado: sessions não tinha origem. | Novas sessões exigem tentativa; desktop exige também grant. Índices únicos, guards e histórico impedem reutilização mesmo após excluir sessão/tentativa/grant. |
| Grant pode trocar desafio, usuário, tentativa ou prazo | Confirmado: FKs isoladas não verificavam desafio/canal nem congelavam esses campos. | Validar vínculos na inserção e torná-los imutáveis. Grant deve caber na janela da tentativa e consumir somente uma tentativa desktop válida. |
| Consumo/revogação podem ser desfeitos | Confirmado: checks anteriores admitiam limpar ou mudar timestamps. | Consumo e revogação tornam-se irreversíveis por UPDATE. Prazo absoluto e identidade da sessão são imutáveis. |
| Basta ligar sessions à tentativa com CASCADE | Rejeitado para limpeza temporal: isso poderia apagar sessão válida ao limpar a tentativa. | A origem da sessão aponta para histórico durável, sem FK dele para dados temporários. Excluir usuário continua sendo exclusão explícita de seus dados. |
| Remover toda cascata resolve o problema | Rejeitado: criaria resíduos ao excluir uma conta ou exigiria limpeza manual insegura. | Testar a finalidade de cada FK; manter cascata por usuário, SET NULL para token excluído e histórico protegido. |
| Apenas um batch elimina duplicações | Ajustado: um UPDATE de zero linhas não é erro. | Uma inserção de sessão executa os vínculos/consumos/histórico via triggers na mesma instrução. Duplicação causa ABORT; não depende de inspecionar depois um batch já commitado. |
| Sessão desktop deve durar mais automaticamente | Não implementado: é decisão de produto/risco, não correção automática de integridade. | Manter 1 h absoluta e 15 min inativa. Alternativas abaixo para revisão posterior. |
| SteamIDs devem começar por um prefixo específico | Não aplicado, sem prova de cobertura. Sintaxe numérica não autentica conta. | Manter contrato existente de 17–20 dígitos, decimal canônico positivo até uint64, sem impor prefixo como `765...`; testar diferentes comprimentos/prefixos e limite uint64. |
| Converter todos os timestamps antigos para inteiro | Não aplicado: conversão automática pode alterar dados/semântica. | Auth usa segundos Unix inteiros UTC; cadastro/preferências originais mantêm TEXT. Conversões entre esses contratos precisam ser explícitas no futuro. |

Na inspeção/teste também foi confirmada uma representação ambígua: length(TEXT) e GLOB do SQLite podem ignorar o sufixo após NUL. Novos SteamIDs exigem representação textual ASCII integral, além da validação anterior; novos hashes exigem TEXT de 64 bytes completos. Isso fecha a divergência com validadores de string sem restringir um prefixo de conta. Dados legados não são apagados nem reinterpretados silenciosamente.

O limite mínimo de 17 dígitos é o contrato já adotado pelo projeto, não uma comprovação de todos os universos/tipos de conta Steam. Não foi estreitado. Sua adequação para o perfil OpenID escolhido continua sujeita à revisão do provedor; valores sintaticamente aceitos nos testes são sintéticos, não contas reais comprovadas.

## Como 0005 funciona

A [migração](../backend/migrations/0005_auth_integrity.sql) apenas acrescenta colunas, índices, uma tabela e triggers. Não reescreve 0001–0004 nem recria tabelas antigas.

- `auth_attempts`, `desktop_grants` e `sessions` ganham `integrity_version`. Linhas já existentes recebem 0, com todos os campos anteriores preservados. Novos INSERTs só aceitam 1; UPDATE não pode promover legado. Não inventar vínculos seguros de dados antigos.
- `sessions.source_attempt_hash` é único e referencia `session_origins.attempt_hash` com verificação diferida. `source_grant_hash` é único quando preenchido e seu vínculo é validado pelos triggers. Novas sessões web exigem tentativa web; desktop exige grant desktop com mesmo usuário/tentativa/desafio.
- Inserir um grant valida o estado da tentativa e a consome. Inserir uma sessão valida sua origem e consome a tentativa web ou o grant desktop, gravando `session_origins` na mesma instrução. Não consumir separadamente antes de inserir sessão; isso a tornará inelegível e será negado.
- `session_origins` retém os hashes de tentativa/grant, usuário, hash da sessão enquanto ela existe e instante de emissão. Proíbe reutilização de origem depois da limpeza temporal. O registro fica imutável e não pode ser removido enquanto o usuário existir.
- INSERT OR REPLACE em origens/tentativas/grants/sessões existentes é bloqueado explicitamente, para evitar que substituição implícita apague o estado anterior. Isso não é autorização para usar REPLACE em usuários ou manipular o esquema com privilégios administrativos.
- Criação/prazos, dono, canal, hashes e vínculos não podem ser trocados. Consumo só passa de NULL para instante inteiro válido, dentro do prazo e sem tempo futuro. Nova sessão começa não revogada, com última atividade na criação.
- `expires_at` permanece fixo. `last_seen_at` só avança até o relógio D1 se a sessão anterior ainda estiver ativa e não revogada; sessão inativa há pelo menos 900 s não pode ser ressuscitada com UPDATE. Revogação pode ser repetida com o mesmo valor, mas não limpa, antecipada ou alterada.

### Exclusão e integridade referencial

| Operação | Resultado esperado e testado |
| --- | --- |
| Apagar tentativa | Apaga seus grants temporários por CASCADE; sessão emitida e histórico permanecem. |
| Apagar grant | Não apaga sessão; histórico de emissão impede reutilização do código já emitido. |
| Apagar sessão | Histórico permanece; sua FK `session_hash` recebe NULL. Não libera tentativa/grant para nova emissão. |
| Apagar histórico manualmente | Negado enquanto seu usuário existe; não é operação de limpeza temporal. |
| Apagar usuário | Remove suas sessões, grants e históricos; preserva dados dos outros usuários. Tentativas sem referência ao usuário ainda dependem da futura limpeza por TTL. |

A FK diferida entre sessão e histórico permite que o AFTER INSERT crie o registro de origem antes da confirmação. FKs, índices e triggers foram exercitados com `foreign_key_check`, `quick_check`, rollback e exclusão do usuário. Não desativar constraints/triggers nem tratar permissões de administração do banco como controles por usuário.

O histórico é retido durante a existência do usuário para sustentar a unicidade após limpeza. É dado pseudônimo ligado à conta, não dado público. Antes de produção: definir teto de sessões/tentativas por conta, política de privacidade, orçamento de armazenamento e eventual expurgo seguro. Apagar a conta encerra essa garantia histórica junto com seus dados/sessões; não manter dados pessoais indefinidamente apenas por conveniência.

### Upgrade e legado

O teste de upgrade cria 0001–0004, insere preferências, desejos, metas, tentativas/grants e sessões ativas/revogadas/expiradas e compara todos os campos anteriores após 0005. Inclui estado temporal ambíguo antes permitido: ele é preservado como legado, não convertido em autenticação válida. Falha forçada depois do DDL no batch demonstra rollback das colunas/tabela/triggers e dos dados; reaplicar a migração depois funciona.

As linhas legadas permanecem consultáveis, mas não podem originar novas sessões nem ser promovidas por UPDATE. A migração não apaga ou revoga silenciosamente sessões antigas nem afirma que eram autenticadas.

**Requisito obrigatório antes de habilitar autenticação:** o futuro middleware deve rejeitar `integrity_version = 0`, origem ausente e qualquer vínculo divergente. A consulta de autorização deve exigir versão 1 e histórico correspondente ao token, usuário, tentativa e grant/canal, além dos prazos e da ausência de revogação. Encontrar uma linha por token não basta. Não pode haver fallback para legado nem promoção automática; é necessária nova autenticação validada.

Essa negação na leitura **ainda depende do código futuro** e deve ter testes HTTP negativos obrigatórios antes de habilitar rotas privadas. Os triggers comprovam integridade de escrita, não validam uma sessão em um SELECT. Hoje a proteção HTTP efetiva é a negação incondicional de todas as rotas privadas/auth. Mesmo versão 1 e histórico consistente não substituem a comprovação de identidade pelo futuro verificador OpenID antes da criação da sessão.

## Política de sessão desktop: mantida nesta etapa

**Atual: até 1 h absoluta e 15 min sem atividade; sem refresh token.** O limite absoluto permanece no CHECK de 0003 e os novos guards impedem estendê-lo. Os valores abaixo são alternativas para uma decisão posterior, não recomendações já aprovadas.

| Alternativa | Vantagem | Custo de segurança e critérios antes de escolher |
| --- | --- | --- |
| Manter 1 h / 15 min | Simples, reduz janela de token roubado; sem persistência prolongada. | Pode pedir novo login frequentemente durante jogos. Medir experiência sem acrescentar renovação escondida. |
| Sessão de 8–12 h / 30–60 min inativa | Menos interrupções durante uso desktop. | Aumenta exposição de token roubado; requer armazenamento nativo, logout/revogação comprovados e decisão explícita de risco. |
| Acesso curto + refresh de dias, com rotação | Uso persistente sem bearer de acesso duradouro. | Novo protocolo: família de refresh, detecção de reuso, rotação atômica, revogação por dispositivo, cofre e recuperação. Fora deste escopo; nenhuma alteração automática. |
| Memória somente, novo login após fechar | Minimiza persistência em disco. | Pode causar atrito e não revoga automaticamente um token já roubado no servidor. Requer política de saída e falhas de rede. |

Separar sempre expiração absoluta e inatividade. Atividade de fundo não deve manter sessão indefinidamente sem decisão explícita. Renovação futura será nova emissão/protocolo revisado, não UPDATE do prazo antigo para contornar a política. Os princípios gerais de ciclo de sessão estão na [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); os intervalos alternativos acima são opções locais a avaliar.

## O que os testes comprovam e o que não comprovam

Os [testes de integridade](../backend/tests/auth-integrity.test.ts) usam D1 emulado real, temporário e sem bindings remotos. Verificam upgrade, versões legadas, valores imutáveis, vínculo/canal/desafio/dono, relógio inteiro, unicidade, REPLACE, limpeza sem cascata indevida, rollback de instruções/triggers e de batches/DDL, além de consultas de integridade.

As disputas executam 20 chamadas D1 independentes via Promise.allSettled para um grant/tentativa. Demonstram que exatamente uma inserção vence **nesse emulador**. Não são callbacks HTTP concorrentes, não envolvem várias regiões/Workers implantados, não comprovam assinatura OpenID, browser binding ou sessão autenticada. Nenhuma rota de teste permissiva foi adicionada.

Para expiração por tempo, snapshots v1 de sessão inativa/expirada/revogada são inseridos num banco de teste isolado após o DDL e antes de instalar os mesmos triggers da migração; simulam estados históricos sem esperar 15 minutos nem falsear o relógio de produção. Os testes exercitam os guards reais de UPDATE e um caso ativo que avança. Essa preparação não existe no produto e não é uma prova de passagem real de 15 minutos ou de relógio distribuído.

O teste de rollback inicialmente tentou `PRAGMA integrity_check`, recusado pelo D1 emulado. Foi ajustado para `PRAGMA quick_check`, documentado como suportado, junto com `foreign_key_check`. Não confundir SQLite genérico com tudo que D1 autoriza. Fontes: [PRAGMAs D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/) e [batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

## Riscos que continuam bloqueando login real

1. Banco não verifica assinatura Steam, descoberta, nonce do protocolo, consentimento ou browser binding. Chamar um INSERT privilegiado ainda é responsabilidade do futuro backend verificado; inclusive a identidade de uma tentativa web precisa vir da asserção validada. Flag de integridade não é prova de identidade.
2. Expiração não apaga linhas nem muda status automaticamente. Futuro middleware precisa negar sessão sem origem v1, revogada, vencida ou inativa e usar identidade derivada da sessão. Guards reduzem reativação por escrita, mas não tornam um SELECT por token autorização segura.
3. O relógio D1 é a referência confiável; relógio do cliente não deve decidir prazos. Recuo do relógio, restauração de backup e rollback operacional precisam de desenho próprio para não reativar tokens historicamente revogados. Um administrador capaz de remover triggers/alterar dados fica fora da garantia estrutural.
4. A instrução de sessão é atômica no emulador, mas coordenação de nonce + callback + grant e falhas de rede/commit permanecem por implementar e testar. Não marcar R03/G3 da revisão como concluídos por isso; houve redução da lacuna SQL, não implementação do protocolo distribuído.
5. Continuam pendentes R01/R02: pareamento navegador/dispositivo resistente a relay, validador OpenID completo, formato oficial efetivo/descoberta. Também faltam autorização por usuário, cofre/IPC Tauri, CSRF, revogação HTTP, limites, privacidade e viabilidade operacional gratuita.

Executar localmente na raiz: `npm.cmd run check`. Isso aplica migrações **locais**, verifica tipos/lint, testes e builds, com Worker somente dry-run. Não executa deploy, criação remota, commit ou push.

## Resultado da validação desta etapa

- `npm.cmd run check`: aprovado; TypeScript frontend/Worker, ESLint e builds React/Worker passaram.
- 258 testes aprovados: 154 gerais + 40 de backend existentes adaptados + 64 novos de integridade.
- Wrangler aplicou 0005 no banco persistente local; 26 instruções executadas com sucesso. Os testes isolados executam a mesma migração no D1 temporário.
- Upgrade com snapshots anteriores preservado, rollback de DDL/batch comprovado, `foreign_key_check` vazio e `quick_check = ok`.
- Nenhuma funcionalidade de autenticação ou rota privada habilitada, alteração no frontend, nova dependência, recurso remoto ou deploy. Commit e push dependem de pedido explícito do responsável.

Esses resultados se limitam ao ambiente local e à configuração emulada usada na suíte. As provas HTTP/protocolo e a avaliação operacional descritas acima continuam pendentes.
