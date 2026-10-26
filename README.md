# Steam Companion — protótipo inicial

> Projeto pessoal gratuito e open source, sob licença MIT. **Este repositório é um PROTÓTIPO: não realiza login Steam, não faz consultas reais nem fornece preços reais.**

## Objetivo

Um aplicativo Windows para acompanhar a biblioteca Steam, guiar conquistas rumo aos 100%, descobrir guias confiáveis, comparar preços entre Steam, Nuuvem e Eneba, acompanhar desejos e exportar progresso em PNG/JPEG.

## O que funciona nesta versão (v0.1.0)

- Biblioteca demonstrativa com pesquisa, filtros, ordenação e progresso.
- Biblioteca visual em grafite/preto, banner ilustrativo de recentes, capas originais e favoritos em memória (independentes da lista de desejos).
- Página individual demonstrativa com banner/capa originais, resumo, conquistas obtidas/pendentes, navegação por seções e exportação PNG/JPEG. Dados desconhecidos permanecem distintos de zero.
- Promoções em grafite/preto com capas originais, comparação por jogo/loja, busca e filtros. Todos os preços são fictícios; ativação, taxas e histórico real não estão verificados.
- Lista de desejos local com capas, ofertas demonstrativas, busca, filtros e adição/remoção (em memória, reinicia ao recarregar). Alertas ainda indisponíveis.
- Exportação **real** de imagem PNG ou JPEG para um jogo demonstrativo via Canvas.
- Tela de perfil com explicação sobre segurança (login real desabilitado).
- Aplicativo Windows Tauri 2 com a mesma interface demonstrativa; build release e conferência funcional no WebView2 aprovados nesta máquina. Veja [DESKTOP](docs/DESKTOP.md).
- Backend Hono/Workers local com `/health`, D1 emulado e migrações versionadas; separado da interface, sem autenticação habilitada.

### O que NÃO funciona (intencionalmente)

- Login Steam, sessões e sincronização;
- Banco de dados online;
- Biblioteca, conquistas e preços reais;
- Guias validados e recomendações automáticas;
- Instalador Windows validado/distribuído e assinatura do executável.

Não há formulário de senha, Steam Guard ou API key.

A [Fase 1 do redesenho visual](docs/VISUAL_DESIGN.md) abrange navegação e biblioteca, usando as capturas Library Home/Library Gamepage do SpaceTheme como referência. Os jogos recentes têm ordem ilustrativa, sem histórico Steam; dois favoritos de exemplo são restaurados ao reiniciar. A [Fase 2](docs/GAME_DETAIL_DESIGN.md) aplica a mesma identidade à página individual. Guias e recomendações continuam indisponíveis; não é necessário instalar Millennium.

A [Fase 3](docs/COMMERCE_DESIGN.md) aplica essa identidade somente a Promoções e Lista de desejos. Use o coração nas ofertas para adicionar/remover jogos; em desejos, “Comparar ofertas” volta às ofertas do jogo. Os cinco registros demonstrativos originais foram preservados, sem consulta às lojas nem compra. Os mínimos ilustrativos não são um histórico real, e a presença de uma oferta demo não comprova disponibilidade comercial.

## Rodar no Windows pelo VS Code

Para executar no navegador: [Node.js 24](https://nodejs.org/) (mínimo 24.15, com npm) e um navegador. O projeto registra a versão principal em [.nvmrc](.nvmrc). [Git](https://git-scm.com/) é necessário para clonar/versionar; também é possível executar uma cópia extraída de ZIP. [VS Code](https://code.visualstudio.com/) é o editor recomendado. O modo web não exige Rust ou credenciais Steam.

Clone o repositório ou extraia o ZIP, abra a pasta no VS Code e use o terminal PowerShell na raiz, onde está o [package.json](package.json):

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

`npm.cmd ci` instala as versões do lockfile. Nenhum arquivo `.env`, conta, token ou chave de API precisa ser configurado. O [.env.example](.env.example) contém somente um valor público vazio para referência futura.

Abra `http://127.0.0.1:5173`. A porta é fixa: encerre outro Vite nessa porta antes de iniciar uma nova instância. Encerre com `Ctrl+C`. Usar `npm.cmd` evita o bloqueio de `npm.ps1` por políticas do PowerShell, sem alterar a política de segurança do Windows. Em outros terminais, `npm` também pode ser usado.

### Abrir como aplicativo Windows (Tauri 2)

Instale os [pré-requisitos oficiais](https://v2.tauri.app/start/prerequisites/#windows): Microsoft C++ Build Tools com **Desenvolvimento para desktop com C++**, MSVC x64/x86 e Windows SDK; Rust estável **MSVC** pelo [rustup](https://rustup.rs/); e WebView2 Evergreen. Depois reabra o VS Code. Nesta máquina, Rust/Cargo 1.99.1, MSVC/SDK e WebView2 foram reconhecidos e o build Windows passou.

Na raiz do projeto, com esses pré-requisitos instalados:

```powershell
npm.cmd ci
npm.cmd run desktop:info
npm.cmd run desktop:dev
```

O último comando inicia o Vite e abre a janela; não execute `npm.cmd run dev` em paralelo na mesma porta. O backend é opcional e não é iniciado pelo desktop. O aplicativo continua com jogos, conquistas e preços fictícios, sem login. Não precisa de `.env`, conta Cloudflare ou chave Steam.

Para compilar um executável local sem instalador:

```powershell
npm.cmd run desktop:build
.\src-tauri\target\release\steam-companion.exe
```

O release abriu com o demo e gravou PNG/JPEG no WebView2 em teste isolado. `npm.cmd run desktop:bundle` também gerou NSIS, **sem executar o instalador**. Veja [DESKTOP](docs/DESKTOP.md) para instruções, resultados e testes manuais pendentes de destino padrão de downloads, instalação e compatibilidade. Nenhum desses comandos publica o aplicativo.

### Backend local opcional

Depois de instalar as dependências, em outro terminal na raiz:

```powershell
npm.cmd run backend:db:migrate
npm.cmd run backend:dev
```

Em um terceiro terminal, execute `Invoke-RestMethod http://127.0.0.1:8787/health`; o resultado esperado é `status: ok`. O backend fica restrito ao loopback; o estado D1 é local e ignorado pelo Git. Não é necessário login Cloudflare, token ou chave Steam. O frontend continua demonstrativo e funciona sem esse servidor. `/auth/*` retorna 501 e `/api/*` retorna 401 incondicionalmente.

Leia [BACKEND](docs/BACKEND.md) para detalhes de execução, migrações, segredos exclusivos do backend e limitações. Não execute comandos de criação remota ou deploy nesta etapa.

## Verificações e testes

Para executar todas as verificações, sem modo interativo:

```powershell
npm.cmd run check
```

Ou execute cada comando separadamente:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:db:migrate
npm.cmd test
npm.cmd run test:browser
npm.cmd run build
npm.cmd run backend:build
```

O ESLint verifica JavaScript/TypeScript, regras de Hooks e React Refresh; avisos fazem a verificação falhar. O TypeScript também verifica os testes e suas configurações. Os testes usam Vitest, Testing Library e jsdom, com dados locais e sem serviços externos:

- Biblioteca: busca sem distinção de maiúsculas/minúsculas, estado vazio, filtros de conclusão, combinação de filtros e ordenação.
- Interface: detalhes de conquistas, escolha PNG/JPEG, retorno à biblioteca, desejos e login desabilitado.
- Exportação: dimensões, MIME, extensão, nome do arquivo, progresso parcial/zero/completo, aviso de demonstração e falha de contexto Canvas.
- Publicação: regras de exclusão de arquivos privados/gerados, preservação dos arquivos do projeto e exemplo público sem valores configurados.
- Integração Steam: contratos, provedores e respostas simuladas, privacidade, falhas parciais, timeout e limites; sem consultas reais.
- Backend: rotas públicas/bloqueadas, falhas sanitizadas e migrações em D1 temporário, com validação, integridade e primitivas SQL de expiração, revogação e uso único.

`npm.cmd run test:browser` executa a regressão Playwright em navegador real: limpar busca e filtro por mouse, Tab/Enter e Tab/Espaço, em sete tamanhos de janela entre 320 e 1440 px. Esse teste também faz parte de `check`. No Windows, usa o Microsoft Edge instalado, em perfil temporário/headless, sem acessar perfil ou conta pessoal. Se Edge estiver ausente, instale-o pelo site oficial da Microsoft; o teste não instala navegadores automaticamente. No Linux, prepare uma vez o Chromium com `npx playwright install --with-deps chromium` (download gratuito; dependências do sistema podem exigir privilégios). A CI executa essa preparação somente no Linux.

Os testes de navegador também cobrem as páginas individuais de todos os jogos demo, retorno à biblioteca preservando busca/filtro, âncoras por mouse/teclado, layouts de 320 a 1920 px, redimensionamento e arquivos PNG/JPEG efetivamente baixados com 1200×630. Os estados sem dados/privados/incompletos e as falhas de exportação têm testes de componente com dados locais; não representam consultas Steam reais.

Promoções e desejos têm regressões de agrupamento/comparação entre lojas, busca/filtros, adição/remoção por mouse e teclado, foco após remoção, estados vazios e recarga. A suíte [commerce.spec.ts](tests/browser/commerce.spec.ts) também verifica layouts de 320 a 1920 px e os avisos de preços fictícios. A conferência complementar do executável Windows/WebView2 está registrada em [COMMERCE_DESIGN](docs/COMMERCE_DESIGN.md).

O runner inicia e encerra seu próprio Vite em `http://127.0.0.1:4173`, separado da porta 5173 do desenvolvimento. Mantenha 4173 livre. As interações usam somente o demo local. Resultados e diagnósticos ficam ignorados pelo Git em `test-results/` e `playwright-report/`. A análise da falha de clique do navegador integrado está em [VISUAL_DESIGN](docs/VISUAL_DESIGN.md#investigação-do-clique-em-limpar-busca-e-filtros).

`check` também aplica as migrações no D1 **local**, verifica os tipos do Worker e compila o backend em dry-run. `npm.cmd run test:backend` executa somente os testes de backend. Esses testes usam o runtime local do Wrangler, com bindings remotos desativados; não comprovam login, CSRF ou logout implementados. O primeiro `npm.cmd ci` precisa de internet para baixar dependências.

Para reexecutar testes durante a edição, use `npm.cmd run test:watch`. Para auditoria de vulnerabilidades conhecidas, use `npm.cmd audit`; essa consulta requer internet e não substitui revisão de segurança.

Os testes unitários de exportação simulam Canvas e download: validam a lógica, mas não comprovam pixels ou gravação real. A conferência adicional no WebView2 gravou PNG/JPEG em pasta isolada; o destino padrão dos downloads e os testes manuais restantes estão descritos em [DESKTOP](docs/DESKTOP.md).

As verificações de configuração desktop cobrem permissões, CSP, loopback e separação do backend. `npm.cmd run check` e a CI existente **não compilam Rust**. Com o toolchain instalado, execute também `npm.cmd run desktop:check` (formatação, compilação de tipos e três testes Rust das restrições de navegação/download) e `npm.cmd run desktop:build`. Ambos passaram nesta máquina; os comandos Cargo usam o lockfile versionado com --locked.

`npm.cmd run build` gera a interface estática em `dist/`. Para conferi-la localmente, execute `npm.cmd run preview` após o build e abra o endereço informado. O Tauri usa esses mesmos arquivos. O instalador foi gerado, mas instalação/desinstalação ainda precisam de teste; integrações reais permanecem no [planejamento](docs/ROADMAP.md).

## GitHub Actions e custo zero

O [workflow de verificação](.github/workflows/ci.yml) executa instalação pelo lockfile, typecheck, lint, testes e build em cada `push` e `pull_request`, nos runners padrão Ubuntu e Windows, com Node 24. As actions estão fixadas por SHA; o token tem somente leitura e não é persistido pelo checkout. Não há secrets configurados, deploy, publicação de release, upload de artefatos ou cache persistente.

Inclui migrações D1 locais, testes do backend e compilação Worker com `wrangler deploy --dry-run`, sem upload ou recursos remotos.

Segundo a [política do GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions), runners padrão são gratuitos para repositórios públicos. Para evitar consumo de cota/cobrança em repositórios privados, o job possui uma condição que o mantém desativado nesse caso. Em uma cópia privada, rode `npm.cmd run check` localmente. A CI remota só poderá ser confirmada depois de uma publicação manual autorizada; criar este arquivo não envia nada ao GitHub.

## Estrutura

```text
src/
  App.tsx         Interface e navegação demonstrativas
  demo.ts         Dados fictícios e adaptador de biblioteca de teste
  exportImage.ts  Exportação PNG/JPEG via Canvas
  types.ts        Contratos de dados futuros
  styles.css      Layout
tests/            Testes de interface, exportação e regras de publicação
src-tauri/        Janela Windows, restrições nativas, capacidades e configuração Tauri 2
.github/
  workflows/      Verificações em push e pull request (sem publicação)
backend/
  src/            Worker Hono: health e reservas de rotas bloqueadas
  steam/          Cliente Steam exclusivo do servidor, ainda sem rota ativa
  migrations/     Esquema versionado, aplicado somente em D1 local
  tests/          Rotas e migrações no D1 emulado
  wrangler.jsonc  Configuração local, sem conta ou recurso remoto
docs/
  REQUIREMENTS.md Requisitos priorizados
  ARCHITECTURE.md Arquitetura e separação de responsabilidades
  SECURITY.md     Regras de segurança e decisões pendentes
  ROADMAP.md      Etapas e critérios de aceite
  INTEGRATIONS.md Fontes externas e pontos a validar
  AUDIT.md        Análise técnica inicial e limitações daquela etapa
  BACKEND.md      Execução local, migrações e verificações do Worker
  AUTHENTICATION.md Arquitetura proposta e bloqueadores para login real
  DESKTOP.md      Pré-requisitos Windows, execução Tauri e limitações dos testes
AGENTS.md         Regras fundamentais para alterações no projeto
eslint.config.js  ESLint para React e TypeScript
vitest.config.ts  Configuração dos testes
```

## Segurança

Não comitar credenciais. Jamais solicitar senha, código Steam Guard, cookies Steam ou Steam API Key ao usuário. O login real será por Steam OpenID, com verificação server-side e sessão própria. **Não implemente o login real usando somente o frontend.** Leia [docs/SECURITY.md](docs/SECURITY.md).

O [.gitignore](.gitignore) exclui arquivos de ambiente privados (mantendo somente exemplos vazios), `.dev.vars`, estado Wrangler, configuração local de autenticação, certificados/chaves, bancos locais, dependências, logs e artefatos de build/testes. Não publique dados privados com outros nomes. Arquivos já rastreados continuam rastreados mesmo após adicionar uma regra de exclusão.

Antes de publicar manualmente, revise os arquivos, o diff e o histórico Git. Não use inclusão forçada de arquivos ignorados nem publique backups privados. Se algum segredo já tiver sido versionado, removê-lo do arquivo atual não basta: será necessário revogá-lo e tratar o histórico. A CI de qualidade não faz varredura completa de segredos ou histórico.

## Análise e próximos passos

A [análise técnica](docs/AUDIT.md) registra o estado da revisão inicial, suas verificações e limitações. O [plano de desenvolvimento](docs/ROADMAP.md) organiza as etapas propostas e seus critérios de aceite. Novas funcionalidades aguardam revisão desse planejamento.

A análise é um registro da etapa anterior. A base atual inclui ESLint, testes, CI, backend local e estrutura desktop Tauri. Login Steam, banco online, consultas externas reais e distribuição de instalador continuam pendentes.

### Preparação da biblioteca Steam

A [camada de integração Steam](docs/STEAM_LIBRARY.md) agora inclui contratos, validação de respostas, provedor de biblioteca e cliente exclusivo do servidor para GetOwnedGames, GetPlayerAchievements e GetSchemaForGame. Há tratamento de privacidade ambígua, respostas incompletas, indisponibilidade, limites, timeout e cancelamento. A interface usa o contrato de provedor, preservando o demo como padrão e sem alterar o layout.

**Não há consulta real ativa, login ou chave configurada.** Os testes usam somente dados sintéticos e rede simulada. Não configure chave em `VITE_*` nem importe o cliente de servidor na aplicação. A elegibilidade da conta do operador, backend seguro, autorização, política de privacidade, cache e limites globais ainda precisam ser concluídos antes do uso real. Os dados e termos da Steam não são cobertos pela licença MIT do projeto.

### Preparação do backend e autenticação

O Worker local usa Hono e binding D1 emulado, com migrações para revisar o esquema original e preparar sessões, tentativas, nonces e códigos desktop. Essas tabelas não habilitam login ou acesso privado. [AUTHENTICATION](docs/AUTHENTICATION.md) define a proposta OpenID 2.0, retorno Tauri com prova de posse, sessões revogáveis, CSRF e isolamento, além dos requisitos que ainda precisam ser comprovados. Não foram criados serviços remotos nem configurados segredos reais.

A [preparação OpenID/D1](docs/OPENID_D1_PREPARATION.md) compõe o verificador com contexto de tentativa, registro atômico de asserção/nonce e consulta estrita de proveniência. Os testes usam D1 emulado e Steam simulada; as rotas permanecem bloqueadas, sem emissão de sessões ou conexão do aplicativo. Descoberta real, pareamento, retenção e fluxo completo continuam como bloqueadores.

## Licença

O código original do projeto está sob a [licença MIT](LICENSE), escolhida pelo responsável nesta preparação do primeiro commit. As dependências mantêm suas próprias licenças; veja as atribuições e a revisão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Preserve esses avisos ao redistribuir o projeto ou seus artefatos.

## Aviso

Projeto independente e não afiliado à Valve/Steam, Nuuvem ou Eneba. Nomes de jogos, preços, histórico, contas e conquistas desta versão são fictícios.
