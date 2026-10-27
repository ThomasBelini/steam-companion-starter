# Laboratório local de pareamento desktop/navegador

**Evolução atual:** [DESKTOP_PAIRING_UI](DESKTOP_PAIRING_UI.md) documenta o reuso revisado deste mecanismo em uma configuração Windows debug opt-in. O console e seus 30 testes permanecem separados; o build normal continua excluindo o protocolo. Nesta configuração nova, a confirmação independente é uma ação explícita na janela do aplicativo após intenção validada no navegador, sem enviar o valor de confirmação ao React. As observações abaixo descrevem a revisão histórica do console; não aprovam produção ou login real.

**Somente simulação opt-in. Não habilita login, não consulta Steam e não emite sessões.** Não importar este laboratório no Worker, no frontend ou no binário Tauri normal. A interface SpaceTheme, CSP, capabilities, IPC, navegação nativa, OpenID e migrações permanecem inalterados.

## Decisão e limites do escopo

O retorno candidato é HTTP em **127.0.0.1 com porta efêmera**, reservada e mantida aberta antes de iniciar a tentativa. Não usar `localhost`, `0.0.0.0`, endereço da LAN, porta fixa ou parâmetro de redirecionamento controlado pelo navegador. Não há deep link, polling, abertura automática de URL, shell, plugin ou nova permissão Tauri.

O [exemplo Cargo](../src-tauri/prototype/main.rs) é um processo nativo de console separado. Exige a feature `pairing-prototype` e o argumento `--simulate`; não é iniciado pelo aplicativo nem incluído no seu bundle. Isso permite testar o transporte nativo real antes de decidir um comando IPC estreito e revisado. O navegador é externo e aberto manualmente no endereço gerado pelo laboratório; não há página de autenticação no WebView2.

A [autoridade simulada](../src-tauri/prototype/pairing.rs) está no mesmo processo Rust, separada do listener nativo por um contrato interno e Mutex. Seu segundo listener serve somente HTML de laboratório em outra porta efêmera de 127.0.0.1. **Não é Hono, HTTPS, OpenID ou D1.** Resgate e consumo ocorrem por chamada Rust em memória, não por uma rota HTTP. Não há chave Steam nem mecanismo de ativação de autenticação no Worker.

## Fluxo implementado

```mermaid
sequenceDiagram
    actor U as Pessoa testando
    participant N as Processo Rust de laboratório
    participant B as Navegador externo
    participant M as Autoridade simulada em memória
    N->>N: Reservar 127.0.0.1:porta aleatória
    N->>N: Gerar verifier, state e confirmação independentes
    N->>M: Registrar desafio S256, state, retorno fixo e hash da confirmação
    N-->>U: URL local e confirmação descartável (nunca verifier)
    U->>B: Abrir URL gerada e conferir aviso SIMULADO
    B->>M: GET início; vincular primeiro cookie ao contexto
    M-->>B: Cookie HttpOnly/SameSite=Strict e formulário com CSRF
    U->>B: Informar confirmação exibida no terminal nativo
    B->>M: POST com Origin exata, cookie, CSRF, state e confirmação
    M-->>B: Link fixo de retorno com código de uso único e state
    U->>B: Clicar em Concluir no aplicativo de laboratório
    B->>N: GET loopback com code e state, sem token
    N->>M: Resgatar com code, state e verifier (chamada Rust simulada)
    M->>M: Validar e consumir atomicamente sob Mutex
    M-->>N: Apenas sucesso simulado, sem identidade ou sessão
    N->>N: Encerrar listeners e destruir verifier
```

1. `getrandom` fornece 32 bytes do gerador do SO por valor. O **verifier** é BASE64URL sem padding desses bytes (43 caracteres); seu desafio é `BASE64URL(SHA256(ASCII(verifier)))`, conforme a transformação S256 da RFC 7636. É uma proteção do **nosso futuro resgate de código**, não PKCE oferecido pelo Steam OpenID 2.0.
2. `state` e **confirmação de intenção** são gerados independentemente, também com 32 bytes. A confirmação é exibida deliberadamente no console do laboratório e digitada no navegador; **não é o verifier**. Não salvar/transmitir a saída do laboratório. A URL de início contém apenas state. Uma cópia desse link, cookie e CSRF não basta para confirmar sem o valor nativo independente.
3. A autoridade guarda desafio e hashes da confirmação, cookie, CSRF e código. Só aceita o primeiro vínculo de navegador; um segundo contexto sem o cookie correto não o substitui. Atualizar a página por navegação direta/mesma origem com o cookie correto renova o CSRF. GETs de background, outras origens e navegações same-site entre portas são negados antes dessa mutação. Três confirmações canônicas incorretas bloqueiam a tentativa; erros não emitem código.
4. O POST exige `Origin` exata, cookie, CSRF, state e confirmação. A CSP da página própria é `default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`: não há JavaScript, recursos externos ou iframe. Respostas não são cacheadas. `Referrer-Policy: same-origin` permite a Origin verificável do formulário e impede Referer entre as duas portas; o link de retorno também usa `rel=noreferrer`.
5. O laboratório usa link GET explícito após o POST, sem redirect cross-origin de formulário. Um ensaio inicial com 303 não completou o retorno no navegador devido à política do formulário; o link preserva `form-action 'self'` e evita ampliar a CSP. Testes de navegador executam os dois cliques reais.
6. O código tem 256 bits, prazo de **até 60 s**, limitado também ao fim da tentativa de **até 120 s**. Nenhum parâmetro pode substituir o endereço de retorno reservado. O código isolado não permite resgate sem a prova nativa.
7. O listener nativo exige Host literal exato incluindo porta, caminho fixo, GET, state/código canônicos, ausência de Origin e Fetch Metadata de navegação/documento. Esses headers são defesa adicional contra páginas, **não autenticam um cliente HTTP**, que pode forjá-los. A autorização depende da tentativa, código e prova.
8. O resgate simulado valida e consome sob o mesmo Mutex: um único vencedor. Cancelamento é serializado com o consumo; expiração usa relógio monotônico. Fechar o laboratório, Enter, sucesso ou timeout fecha os dois listeners. Um cliente incompleto tem deadline total de 1 s; cancelamento é observado durante a leitura. A espera interna do processo não é polling HTTP.
9. O verifier nunca é retornado por uma API, serializado, impresso, enviado por URL ou passado ao navegador/React. `Zeroizing` limpa buffers sob sua responsabilidade quando descartados. Isso **não** prova proteção contra malware local, debugger, swap, crash dump ou toda cópia temporária feita pelo compilador/bibliotecas. Nada é persistido no disco pelo laboratório.

10. Host/Origin preservam seus valores após remover somente OWS HTTP (SP/HTAB). Não normalizar NBSP/espaços Unicode em origens válidas. O cookie de vínculo precisa ser único, ASCII/canônico e estar em um header sem fragmentos malformados. O GET inicial exige `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, `Sec-Fetch-Site: none` ou `same-origin`, sem Origin; a checagem precede qualquer alteração de vínculo/CSRF. São restrições específicas do laboratório, não uma especificação já aprovada para callback Steam.

## Contratos para futura integração (não implementados)

- Backend HTTPS com origem fixa deverá registrar desafio, tentativa e **retorno loopback validado estruturalmente**; aceitar somente `http://127.0.0.1:<porta válida>/callback`, sem userinfo, fragmentos, hosts alternativos ou retorno arbitrário. O endereço completo deve ficar imutável no contexto, não ser inferido de Host/headers recebidos. Só a porta é variável.
- Manter o retorno Steam **no callback HTTPS do backend**. Steam não redirecionará diretamente ao listener local; o backend emitirá o código próprio apenas após as validações OpenID, consentimento e transição D1 aprovadas.
- S256 enviado em base64url e `challenge_hash` D1 em hex precisam representar **os mesmos 32 bytes de digest**. Não calcular SHA256 do desafio base64url novamente por acidente. Nenhuma migração foi necessária neste laboratório.
- Browser binding real requer cookie curto `Secure; HttpOnly; SameSite=Lax` com prefixo `__Host-`, Path=/, sem Domain, contexto imutável, CSRF e confirmação de intenção/conta/destino. Lax precisa de prova prática no callback externo da Steam; Strict neste laboratório não testa esse fluxo. Um cookie criado somente ao abrir um link não resolve relay.
- O cookie do laboratório **não** usa Secure nem prefixo __Host-, porque a origem é HTTP local. Cookies não são isolados por porta: o nome inclui state para evitar colisões, mas outro serviço local malicioso continua sendo uma ameaça. Não copiar essa política para produção.
- Resgate real: POST HTTPS nativo, endpoint fixo, sem redirects, código + tentativa + verifier no corpo, limites/deadline e consumo D1 atômico. Não aceitar desafio como prova. Só depois discutir criação de sessão; sem token em query, deep link, cookie de navegador entregue ao desktop ou IPC React.
- Integração Tauri futura exige ação explícita e comando específico, com destinatário/janela local definidos, cancelamento, limite de tentativas, confirmação da conta e troca de usuário. O navegador deve ser aberto pelo nativo apenas na origem fixa aprovada. Nenhuma permissão genérica shell/http/fs/opener foi adicionada agora.
- Cofre de sessão Windows, revogação e logout continuam ausentes. Avaliar DPAPI por usuário ou Credential Manager; nunca segredo no JavaScript, arquivo texto ou fallback inseguro. Não é necessário armazenar o verifier em disco.

## Modelo de riscos e resultados negativos

| Risco | Defesa demonstrada no laboratório | Limitação / gravidade residual antes do login |
| --- | --- | --- |
| Retorno espontâneo/login CSRF | Não há tentativa sem criação nativa; state/código/prova/vínculo obrigatórios; POST com cookie+CSRF+Origin | **Crítico R01:** falta intenção associada à identidade real, conta/destino e avaliação contra engenharia social |
| Relay para outro desktop | URL pública não contém confirmação; dois processos rejeitam retornos cruzados; código exige verifier correto | **Crítico R01:** vítima pode ser induzida a copiar também a confirmação fornecida pelo atacante; não existe prova de proximidade/dispositivo por cookie/PKCE/IP |
| Interceptação de código | Porta reservada antes da tentativa; prova nativa não sai do Rust; código de uso único | Processo malicioso local pode observar/adulterar HTTP, negar serviço, roubar confirmação/cookie ou depurar memória; não é resolvido por loopback |
| Replay/concorrência | Uso único sob Mutex, 12 resgates concorrentes e duas requisições TCP reais com um vencedor | **Crítico R03:** não comprova transação distribuída, D1 remoto, retries após commit desconhecido, nem emissão de sessão |
| Forja/DNS rebinding | Bind IPv4 literal, peer/Host exatos, caminho, método, Fetch Metadata, Origin e parâmetros restritos | Headers não são prova criptográfica; malware local pode reproduzi-los; DoS continua possível durante até 120 s |
| Redirecionamento/phishing | Destinos gerados nativamente; sem return URL arbitrária; página claramente simulada, sem conteúdo Steam | Domínio HTTPS, abertura pelo SO, UX de confirmação real e análise adversarial ainda não validados |
| Vazamento de código | Só código temporário/state no retorno; no-store, sem terceiros, Referer restrito, nenhum token real | Código pode permanecer no histórico do navegador; revisar limpeza/redirecionamento final e logs do serviço antes de produção |
| Parser HTTP local | Tamanhos, deadline, duplicatas, framing, método e strings canônicas verificados | Parser específico de laboratório, **não aprovado para produção**; revisar servidor HTTP mantido/hardening/fuzzing antes de integrar ao app |
| Cookie entre portas | O navegador enviou o cookie HttpOnly a um servidor adversarial em outra porta de 127.0.0.1 | **Risco técnico demonstrado, alto para uso real:** cookies HTTP locais não isolam processos. Sem aprovação nativa não houve emissão de código, e o verifier não foi exposto |
| Primeiro navegador incorreto | Link copiado e aberto antes do navegador pretendido toma o vínculo inicial; sem confirmação correta, o POST é negado | **Disponibilidade, médio no laboratório:** o navegador legítimo recebe 403 até cancelar/expirar e reiniciar. Exclusividade do primeiro vínculo é limitação do protocolo, não prova da intenção do navegador |

Não existe atestação de aplicativo público por client secret. O backend futuro não poderá distinguir toda cópia modificada do app apenas por nome do binário, IP, CORS ou constante embutida.

## Executar no Windows

Com Node 24, Rust/MSVC e os pré-requisitos de [DESKTOP](DESKTOP.md), na raiz:

```powershell
npm.cmd run desktop:pairing
```

Abra **manualmente no navegador externo** a URL local gerada; confira que iniciou a tentativa neste computador, informe a confirmação exibida no terminal e clique em **Confirmar simulação neste computador**, depois **Concluir no aplicativo de laboratório**. Deve aparecer “Pareamento simulado concluído”; nenhuma tela do Steam ou sessão será criada. Enter cancela. Após 120 s, inicie nova tentativa. Não reutilize valores de execução anterior nem encaminhe o link/confirmação a outra pessoa.

O aplicativo aprovado continua abrindo por `npm.cmd run desktop:dev` ou `npm.cmd run desktop:build`. Seu botão Steam continua desabilitado; este laboratório não aparece na interface nem requer mudar CSP/capabilities.

```powershell
npm.cmd run desktop:pairing:test
npm.cmd run desktop:check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --features pairing-prototype -- -D warnings
npm.cmd run check
npm.cmd run desktop:build
```

O teste de navegador usa Edge no Windows, tal como a suíte Playwright existente; no Linux requer Chromium do Playwright (`npx playwright install chromium`). Não baixa navegador durante o teste. O runner inicia somente os executáveis locais de laboratório; o frontend continua sem shell/IPC.

## Cobertura do GitHub Actions

Antes desta alteração, o [workflow](../.github/workflows/ci.yml) não executava Cargo. Agora preserva a matriz Ubuntu/Windows, Node 24, TypeScript, ESLint, migrações D1 locais, testes gerais/backend, 39 testes Playwright da interface e builds web/Worker dry-run. O job continua restrito a repositório público, com `contents: read`, checkout sem credenciais persistidas, actions fixadas por SHA, sem secrets/deploy ou artefatos de aplicação.

Somente no Windows, depois do build web, prepara Rust estável MSVC com rustfmt/Clippy e executa:

```powershell
npm.cmd run desktop:check
cargo test --manifest-path src-tauri/Cargo.toml --locked --features pairing-prototype --example pairing-lab
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --features pairing-prototype -- -D warnings
```

Isso cobre os **3 testes Rust do aplicativo e 30 do laboratório**, incluindo sockets locais, expiração, cancelamento, concorrência e regressões da revisão adversarial. Compila o código para testes; não executa o CLI de pareamento, abre navegador ou emite sessões. Rust/Tauri não foi adicionado ao Ubuntu: o alvo do aplicativo é Windows e esta etapa não instala o conjunto GTK/WebKit de um desktop Linux.

**Continuam locais:** os cinco cenários de `desktop:pairing:test` que iniciam executáveis independentes e Edge externo, os testes manuais de navegador padrão/WebView2 e o build release/instalador Windows. A CI chama diretamente `cargo test` para não arrastar o runner de navegador desse script. A suíte Playwright da interface permanece na matriz (Edge headless no Windows e Chromium preparado no Ubuntu); isso não garante o contrato de processos/loopback/diagnósticos exigido pelos cinco cenários do laboratório. Não declarar esses cenários cobertos pelo GitHub enquanto não existir preparação específica e prova remota de seus pré-requisitos. Nenhum teste existente da interface foi desativado.

O Windows tem **60 minutos** para acomodar compilação fria Rust/MSVC; Ubuntu mantém **30 minutos** para as dependências do Chromium. Não há promessa de duração antes da primeira execução no GitHub; acompanhar essa execução manualmente autorizada, sem remover testes se houver falha de instalação/timeout.

O cache usa `actions/cache/restore` e `save` oficiais fixados no mesmo SHA (v5.1.0). Guarda somente `~/.cargo/registry/index` e `~/.cargo/registry/cache`, com chave por SO/arquitetura e hash do lockfile/workflow. Não guarda sources extraídos, `target`, binários, `.cargo` inteiro, tokens, `.env`, dados D1 ou perfis Edge; não usa restore-keys genéricas ou arquivos entre SOs. PRs não executam o passo de gravação; só push bem-sucedido na branch padrão pode salvar um cache ausente. Ausência de cache não pula compilação/testes. O download de cada segmento tem limite de 5 minutos; não alteramos cota/configurações remotas de armazenamento nem habilitamos cobrança adicional. O teto gratuito padrão deve ser mantido.

Referências: [imagem Windows hospedada — ferramentas](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md), [Tauri em GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/), [action oficial de cache](https://github.com/actions/cache/tree/caa296126883cff596d87d8935842f9db880ef25), [segurança e limites de cache](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching). Essas referências não substituem a execução do workflow alterado; validação local não comprova runner hospedado, cache miss/hit remoto ou duração da compilação fria.

Validação local desta alteração de CI: actionlint 1.7.12 aprovado, incluindo sintaxe/expressões; comparação com o workflow anterior confirmou preservação da matriz, permissões, triggers e todos os passos existentes. `npm.cmd run check` aprovou os 522 testes e builds web/Worker; `desktop:check` aprovou os 3 testes Rust; a chamada Cargo isolada aprovou os 30 testes do laboratório; Clippy com `-D warnings` e `git diff --check` passaram. O check usou cópia temporária dos arquivos atuais e estado D1 novo, preservando o banco local original. Não foram reexecutados os cinco cenários Edge do laboratório ou build release nesta alteração, e nenhuma execução remota/cache do GitHub foi iniciada.

## Evidências e gate seguinte

Os [testes Rust](../src-tauri/prototype/tests.rs) combinam regras simuladas com sockets 127.0.0.1 reais; o [teste de navegador](../scripts/test-pairing-browser.mjs) dirige o Edge externo e executáveis nativos reais. Não há conta real, HTTPS, OpenID, Worker ou D1 no protocolo do laboratório.

| Verificação executada nesta máquina Windows | Resultado |
| --- | --- |
| `npm.cmd run check` | Aprovado: TypeScript, ESLint, migrações 0001–0006, 209 testes gerais + 274 backend + 39 Playwright = **522 testes**, build web e Worker dry-run |
| `npm.cmd run desktop:check` | rustfmt, cargo check e **3 testes Rust** do aplicativo aprovados |
| `npm.cmd run desktop:pairing:test` | **30 testes Rust** do laboratório + **5 cenários Edge externo/processo nativo**, todos aprovados na revisão adversarial |
| Clippy com `--all-targets --features pairing-prototype --locked -- -D warnings` | Aprovado, sem avisos |
| `npm.cmd run desktop:build` | Executável Windows x64 gerado em `src-tauri/target/release/steam-companion.exe`, sem instalador/deploy |
| Revisão de escopo e segredos | Frontend, runtime/CSP/capabilities Tauri, backend, OpenID e migrações inalterados; nenhuma credencial real identificada |
| `git diff --check` | Aprovado |

O check completo foi executado sobre cópia temporária dos candidatos a versionamento, com dependências locais existentes e estado D1 novo; o banco original do projeto foi preservado. A revisão de segredos encontrou somente três URLs históricas com credenciais sintéticas em testes negativos preexistentes, conferidas manualmente. Nenhuma foi adicionada nesta etapa. A feature opcional acrescenta somente zeroize ao lockfile transitivo; as outras três crates já estavam fixadas. `cargo tree -e normal --depth 1` no aplicativo continua mostrando apenas Tauri como dependência direta ativa.

Cobertura negativa inclui prova incorreta, ausência/reuso/expiração de código, state adulterado, retorno cruzado, ausência de tentativa confirmada, cookie/CSRF/Origin incorretos, parâmetros repetidos/malformados, Host/framing/tamanho inválidos, cancelamento e leitura lenta. A expiração do código é simulada por relógio do registro; o encerramento por timeout do listener foi medido com prazo real reduzido no teste. Foram executadas 12 threads de resgate em memória e duas conexões HTTP locais independentes disputando o retorno, com exatamente um sucesso. Não são requisições a Workers distribuídos ou provas de transação D1 remota.

Os cinco cenários de navegador exercitam: (1) vínculo de cookie, URL copiada após vínculo, CSRF, confirmação incorreta/correta, retorno e portas fechadas; (2) processos A/B rejeitando retorno trocado e código interceptado de A com o state legítimo de B, seguidos de sucesso de cada retorno correto; (3) cancelamento depois de emitir código, retorno negado e diagnóstico sanitizado; (4) página adversarial real em outra porta, GET de background negado sem invalidar o formulário legítimo, fetch GET/POST ao callback com código válido negado e exposição de cookie entre portas demonstrada; (5) link copiado aberto primeiro, causando negação do navegador pretendido sem permitir confirmar com valor incorreto. Limitações demonstradas não contam como mitigação.

Os processos A/B são executáveis independentes no **mesmo Windows**, cada um com sua autoridade simulada em memória. Não representam dois computadores ou um backend compartilhado. Prova S256 incorreta, expiração do código e reuso lógico são testados nas estruturas Rust simuladas; expiração do listener, cancelamento, HTTP concorrente e navegador usam sockets/processos reais locais. A abertura pelo navegador padrão do Windows e a interação humana não foram automatizadas; foi usado Edge headless controlado pelo Playwright. O laboratório não foi ligado à janela Tauri; não houve novo teste funcional manual do WebView2 nesta etapa. O build do app e a regressão da interface no navegador passaram, sem alterar o visual.

## Revisão adversarial antes do versionamento

A inspeção compreendeu [crypto](../src-tauri/prototype/crypto.rs), [HTTP](../src-tauri/prototype/http.rs), [protocolo](../src-tauri/prototype/pairing.rs), [entrada opt-in](../src-tauri/prototype/main.rs), [testes Rust](../src-tauri/prototype/tests.rs), [runner de navegador](../scripts/test-pairing-browser.mjs), manifesto/lockfile e configuração Tauri. Não houve alteração no main do aplicativo, React, CSP/capabilities, IPC, backend, OpenID ou D1 nesta revisão.

| ID / gravidade no laboratório | Evidência anterior à correção | Correção / regressão |
| --- | --- | --- |
| L01 — média, disponibilidade | GET `/start` com cookie e contexto de outra origem retornava 200 e renovava CSRF. No Edge, uma página same-site em outra porta executou fetch no-cors; o formulário legítimo deixou de ser válido | Negar contexto não autorizado antes de `bind`. Metadados estritos para GET inicial; regressões Rust e navegador confirmam 403 e formulário anterior ainda utilizável |
| L02 — baixa, validação | `trim()` removia NBSP antes/depois de Host e Origin, fazendo entrada malformada corresponder ao valor permitido | Remover somente SP/HTAB. Dois testes de regressão, preservando OWS ASCII legítimo. Isso não foi uma quebra da prova S256 ou da identidade |
| L03 — baixa, ambiguidade | `filter_map` descartava fragmento de cookie sem `=`, inclusive um segundo fragmento com o nome do vínculo; whitespace Unicode também era normalizado | Rejeitar cookies não ASCII, fragmentos malformados, nomes inválidos e duplicatas; três variantes negativas e caso positivo com outro cookie legítimo |
| L04 — baixa, diagnóstico de testes | Ao tentar retornar após cancelamento, o erro do Playwright inclui a URL com o código no texto. O teste confirmou isso em memória, sem imprimir o código | O runner sanitiza URLs e valores base64url/hashes longos antes de reportar erros. Regressão usa o erro real do navegador e confirma que código/confirmação não aparecem na mensagem sanitizada; cleanup aguarda término dos filhos |

As quatro regressões Rust de L01–L03 foram executadas **antes** das correções: 22 testes antigos passaram e quatro novos falharam. A regressão de L01 também falhou no navegador com 200 onde se exigia 403. Depois das correções: 30 testes Rust do laboratório aprovados, incluindo oito novos; o teste de cancelamento anterior foi reforçado para usar o verifier **correto**, evitando mascarar uma falha de cancelamento com uma prova já inválida. Também foram ampliados os testes de expiração das duas portas e retorno expirado por HTTP.

Não foi demonstrada transferência de resultado para B, aceitação de prova S256 incorreta, reutilização de código, sucesso após expiração/cancelamento ou dois consumos bem-sucedidos. Isso descreve os casos executados, não prova ausência de qualquer vulnerabilidade. Cancelamento e resgate usam o mesmo Mutex; as duas conexões HTTP concorrentes obtiveram um único sucesso. Não há teste distribuído ou sessão real.

**Logs/URLs:** o processo nativo exibe somente URL de início com state, confirmação descartável deliberadamente necessária à interação manual, endereço do listener e resultado genérico. A saída não contém código de retorno, verifier ou token. O código aparece apenas no HTML do link e na URL do callback, como exigido pelo protocolo atual; respostas de erro não ecoam entradas. Histórico do navegador, captura do terminal (que revela a confirmação), debugger e logs de terceiros permanecem riscos; não salvar nem compartilhar a saída. A sanitização do runner não controla logs do SO/navegador ou futuras bibliotecas. Nenhum segredo real foi usado.

**Riscos técnicos versus engenharia social:** cookies entre portas e preempção do primeiro navegador são limitações técnicas efetivamente demonstradas, não hipóteses de phishing. Um cliente HTTP nativo pode forjar Origin/Fetch Metadata; os testes TCP fazem isso para entregar um código já confirmado ao destinatário correto. O remetente não recebe o verifier nem sessão. Os filtros ajudam contra páginas, mas não autenticam processos locais. Induzir alguém a encaminhar também a confirmação é risco adicional de engenharia social: não foi eliminado nem validado em dois dispositivos. R01 continua crítico antes de login real.

**Parecer:** apto para versionamento **exclusivamente como laboratório opt-in**, com os limites acima explícitos e após as verificações completas registradas. Nenhum novo acesso IPC, plugin ou rota foi criado. Não está aprovado para uso autenticado, para dados reais, para incorporação ao executável normal ou para produção; parser HTTP de laboratório, cookies HTTPS, backend compartilhado, intenção/conta/destino e demais gates exigem revisão própria. A revisão adversarial não realizou commit, push ou deploy; o versionamento local posterior não autoriza autenticação real.

Referências das correções/limites: [RFC 9110 §5.6.3 — OWS](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.3), [Fetch Metadata — W3C Working Draft](https://www.w3.org/TR/fetch-metadata/), [RFC 6265 §8.5 — ausência de isolamento entre portas](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5).

**Próxima tarefa recomendada:** revisão adversarial do protocolo de intenção/conta/destino, com dois computadores e navegador real, ainda usando identidades simuladas. Incluir link e confirmação encaminhados, serviço loopback hostil, tentativas concorrentes, troca de conta, cancelamento e falhas. Decidir UX resistente a relay e transporte HTTP mantido antes de adicionar IPC ou abrir navegador pelo app. R01 não pode ser encerrado apenas pelos testes locais.

**Bloqueadores explícitos do login real:** relay entre dispositivos/intenção ainda não comprovada (R01) e compartilhamento dos cookies HTTP locais entre portas impedem promover este protocolo ao aplicativo autenticado. Primeiro login continua bloqueado também por descoberta OpenID real restrita e revisada (R02), transação completa D1/retries (R03), retenção/exclusão, sessões/cofre/revogação, isolamento por usuário, domínio/HTTPS/cookies e cotas gratuitas comprovados. Consulte [SECURITY_REVIEW](SECURITY_REVIEW.md), [OPENID_D1_PREPARATION](OPENID_D1_PREPARATION.md) e [AUTHENTICATION](AUTHENTICATION.md). Não habilitar rotas para demonstrar este laboratório.

Fontes oficiais: [RFC 8252 §7.3 e §8.3 — loopback e interceptação](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3), [RFC 7636 §4 e apêndice B — S256 e vetor de teste](https://www.rfc-editor.org/rfc/rfc7636.html#section-4), [OWASP — CSRF, cookies, Origin e Fetch Metadata](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Tauri — capabilities](https://v2.tauri.app/security/capabilities/). As RFCs tratam OAuth: aqui reutilizamos apenas princípios de transporte/prova, sem atribuir OAuth/PKCE à Steam.
