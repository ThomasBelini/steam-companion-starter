# Plano de desenvolvimento proposto

Revisão: 26/10/2026. Aguarda revisão do responsável pelo projeto; as funcionalidades abaixo não foram iniciadas. Evidências e limitações da análise: [AUDIT](AUDIT.md).

## Princípios e arquitetura candidata

- Custo adicional zero: sem APIs pagas, domínio comprado obrigatório, assinatura comercial obrigatória ou cobrança automática. Ao atingir cotas gratuitas, suspender ou degradar recursos.
- Steam OpenID pelo navegador do sistema, verificado no backend. Nunca coletar senha, Steam Guard, cookies ou chave Steam dos usuários finais.
- React/TypeScript na apresentação; domínio, casos de uso, provedores e persistência separados. Tauri 2 como camada Windows com permissões mínimas. Adaptadores substituíveis para Steam, guias e cada loja.
- Um backend modular Worker + Hono + D1 é o candidato, condicionado à viabilidade gratuita. Contratos versionados, validação em tempo de execução e SQL parametrizado.
- Cache/preferências não sensíveis podem ficar locais; segredos do operador ficam no servidor e sessão desktop no armazenamento seguro do Windows. Privacidade por padrão.

Fluxo previsto: interface → casos de uso → provedores → API HTTPS própria → adaptadores externos/banco. O demo permanece como provedor de teste. O cliente nunca contém segredos das integrações.

## Etapa 0 — base e análise atual

- [x] Ler código/documentação e inventariar dependências e funcionalidades.
- [x] Executar TypeScript, build, auditoria npm e iniciar o servidor; conferir tela inicial.
- [x] Testar o rascunho SQL em SQLite em memória.
- [x] Remover fonte remota e corrigir exclusões de arquivos de ambiente/artefatos.
- [x] Registrar lacunas, limitações das verificações e proposta de evolução.

**Pendente após revisão:** testar todas as interações e os arquivos reais PNG/JPEG; escolher licença e padronizar ambiente Node/Git. O protótipo não deve ser apresentado como aplicativo Windows ou integração Steam pronta.

## Etapa 1 — provar viabilidade sem custo: primeiro bloqueador

**Entregas futuras:** matriz de fontes oficiais, termos, elegibilidade, cotas e limitações. Validar callback/realm OpenID e requisito de domínio da chave do operador com subdomínio gratuito. Separar login de acesso aos dados Steam; autenticação não libera biblioteca privada. Investigar fontes permitidas de Steam, Nuuvem e Eneba já nesta etapa.

Começar com documentação e respostas simuladas, sem pedir credenciais. Uma prova real futura com conta de teste e eventual segredo do operador será configurada fora do chat/cliente, após revisão do plano.

**Aceite:** decisão documentada por fornecedor sobre fonte, permissão, custo, cotas, cobertura BR/Steam e dados disponíveis; hospedagem sem cobrança automática. Se o núcleo exigir custo inevitável, interromper a integração e revisar a arquitetura. Inviabilidade de preços pode bloquear somente aquele módulo, desde que a entrega parcial fique explícita.

## Etapa 2 — separar domínio, interface e provedores

**Entregas futuras:** decompor gradualmente a aplicação por módulo, injetar o provedor demo e centralizar regras de progresso. Representar vazio, privado, erro, carregamento, sem conquistas e cache antigo. Identificar jogos/edições por IDs; separar schema de conquista do progresso por usuário. Formalizar contratos de API e persistência.

**Aceite:** a UI usa o demo por contrato; testes relevantes cobrem dados ausentes/privados, cálculo de progresso e jogos sem conquistas. Nenhum SDK de loja acoplado à UI. Acrescentar lint e verificações gratuitas locais/CI, preservando o lockfile.

## Etapa 3 — autenticação e banco seguros: antes do beta conectado

**Entregas futuras:** Worker/D1 de desenvolvimento, migrações versionadas e sessões. Verificar OpenID no servidor com endpoint oficial fixo, assinatura/campos assinados, identidade, retorno, realm, nonce e antirreplay. Definir expiração, logout e revogação.

No desktop, iniciar tentativa com estado e segredo local; retornar somente código curto, de uso único, pelo mecanismo escolhido na prova. Vincular resgate à prova de posse da tentativa e consumir código/nonce atomicamente. Não tratar OpenID como OAuth/PKCE nem colocar tokens de sessão na URL.

Rotas privadas derivam o SteamID da sessão, com consultas parametrizadas e limites de requisição/tamanho. Configurar origens permitidas, logs sem segredos, retenção/exclusão de dados e armazenamento seguro. Não aceitar SteamID arbitrário como autorização.

**Aceite:** testes de retorno/assinatura inválidos, replay, expiração, resgate concorrente, interceptação de retorno, logout e acesso cruzado entre dois usuários. Migrações testadas localmente e no D1 de desenvolvimento; revisão de segurança antes de convidar usuários. Sem isso, login real permanece bloqueado.

## Etapa 4 — primeiro aplicativo Windows com biblioteca e conquistas

**Entregas futuras:** Tauri 2 com CSP, IPC/capacidades mínimas, navegador externo para login e sessão em armazenamento seguro. Integrar biblioteca/conquistas à API própria, com lotes/paginação quando necessários, TTL, backoff e sincronização manual inicial. Tratar perfis privados, dados indisponíveis, falhas parciais e logout durante sincronização.

**Aceite:** instalador de teste funciona no Windows suportado com WebView2; nenhum segredo no bundle, log ou URL. Biblioteca vazia, grande e privada funcionam corretamente. Falha da API não apaga progresso nem vira zero jogos. Nenhuma operação de escrita na Steam.

## Etapa 5 — persistência e exportação de progresso

**Entregas futuras:** desejos por AppID/edição, metas e preferências no backend já protegido; migrações incrementais. Exportação PNG/JPEG por jogo e geral, com tratamento de falhas Canvas/gravação no desktop, sem upload ou dados pessoais por padrão.

**Aceite:** preferências sobrevivem ao reinício e ficam isoladas por conta; logout limpa cache privado. Ambos os formatos abrem com dimensões/conteúdo corretos e são salvos sem acesso amplo ao sistema de arquivos. Capas dependem de licença e tratamento de CORS. SteamID só aparece por escolha explícita.

## Etapa 6 — guias com evidência e controle de spoilers

**Entregas futuras:** links com fonte, autoria, idioma, versão, data de revisão, evidência e status de confiança; atribuição sem reprodução integral. Spoilers e marcações perdível/online/indisponível apenas com fonte. Dificuldade/tempo independentes da raridade. Validar esquemas/URLs; qualquer consulta de URL no servidor requer defesa contra SSRF.

**Aceite:** recomendações explicam fonte e validade; ausência de evidência aparece como desconhecida. Links desatualizados podem ser reportados. Curadoria manual inicial é aceitável, sem IA ou API paga.

## Etapa 7 — comparar Steam, Nuuvem e Eneba: condicionada às fontes

**Entregas futuras:** adaptador por loja autorizada; normalizar jogo/edição, moeda, plataforma, região, vendedor, horário e preço. Separar anunciado, taxa desconhecida e total confirmado. Não classificar como menor preço final uma oferta cujo total é desconhecido. Cache/limites por fonte.

Histórico informa origem e período coberto. Coleta própria autorizada gera histórico somente desde o início das observações, sem dados retroativos inventados. Alertas vêm depois da comparação confiável e somente se sustentáveis nas cotas gratuitas.

**Aceite:** exemplos verificáveis das três lojas, correspondência de produto e ativação BR/Steam. Sem fonte gratuita/permitida, manter aquela comparação indisponível e oferecer somente consulta externa validada, explicitando a entrega parcial. Não fazer scraping ou usar IsThereAnyDeal sem confirmar permissão aplicável.

## Etapa 8 — revisão e publicação open source

**Entregas futuras:** licença aprovada, atribuições, política de privacidade, contribuição e instruções de build. CI Windows em serviço gratuito elegível, verificações de dependências/segredos, instalador e hashes. Revisar acessibilidade, desempenho, atualizações e recuperação de falhas.

**Aceite:** clone limpo reproduz o build; testes críticos, instalação e desinstalação passam; artefatos sem segredos/dados privados. Documentar SmartScreen se não houver assinatura, sem exigir certificado pago. Se houver atualizador automático, exigir assinatura/verificação antes de ativá-lo. Publicar somente após revisão do resultado.

## Sequência e decisões para revisão

Sequência principal: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. A pesquisa de preços ocorre na etapa 1, mas sua implementação pode ficar bloqueada sem impedir o núcleo. Uma release anterior a guias/preços exige escopo reduzido explícito e os mesmos critérios da etapa 8.

| Decisão | Proposta | Condição |
| --- | --- | --- |
| Desktop | Tauri 2 + React existente | Validar WebView2, permissões, login e gravação. |
| Backend/banco | Worker + Hono + D1 | Cotas suficientes, domínio gratuito elegível e nenhum upgrade automático. |
| Licença | Avaliar MIT | Escolha do responsável e revisão de atribuições antes da publicação. |
| Steam | OpenID verificado + API no backend | Sem credenciais dos usuários; acesso e privacidade documentados. |
| Preços | Adaptadores independentes | Fonte permitida/gratuita por loja; cobertura completa ainda não comprovada. |
| Operação | Cache, limites e suspensão na cota | Sem promessa de escala ilimitada, SLA ou disponibilidade eterna. |

Próximo trabalho recomendado após aprovação: **etapa 1**, junto à conclusão dos testes manuais do protótipo. Nenhuma conta, deploy ou serviço pago foi criado nesta análise.
