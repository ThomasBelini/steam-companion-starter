# Steam Companion — protótipo inicial

> Projeto pessoal gratuito e open source, sob licença MIT. **Este repositório é um PROTÓTIPO: não realiza login Steam, não faz consultas reais nem fornece preços reais.**

## Objetivo

Um aplicativo Windows para acompanhar a biblioteca Steam, guiar conquistas rumo aos 100%, descobrir guias confiáveis, comparar preços entre Steam, Nuuvem e Eneba, acompanhar desejos e exportar progresso em PNG/JPEG.

## O que funciona nesta versão (v0.1.0)

- Biblioteca demonstrativa com pesquisa, filtros, ordenação e progresso.
- Página de conquistas por jogo fictício.
- Comparação demonstrativa de preços (valores inventados, claramente identificados).
- Lista de desejos local (em memória, reinicia ao recarregar).
- Exportação **real** de imagem PNG ou JPEG para um jogo demonstrativo via Canvas.
- Tela de perfil com explicação sobre segurança (login real desabilitado).
- Backend Hono/Workers local com `/health`, D1 emulado e migrações versionadas; separado da interface, sem autenticação habilitada.

### O que NÃO funciona (intencionalmente)

- Login Steam, sessões e sincronização;
- Banco de dados online;
- Biblioteca, conquistas e preços reais;
- Guias validados e recomendações automáticas;
- Instalador Windows (Tauri será adicionado após a validação inicial).

Não há formulário de senha, Steam Guard ou API key.

## Rodar no Windows pelo VS Code

Requisitos: [Node.js 24](https://nodejs.org/) (mínimo 24.15, com npm) e um navegador. O projeto registra a versão principal em [.nvmrc](.nvmrc). [Git](https://git-scm.com/) é necessário para clonar/versionar; também é possível executar uma cópia extraída de ZIP. [VS Code](https://code.visualstudio.com/) é o editor recomendado. Rust, Tauri e credenciais Steam não são necessários para esta etapa.

Clone o repositório ou extraia o ZIP, abra a pasta no VS Code e use o terminal PowerShell na raiz, onde está o [package.json](package.json):

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

`npm.cmd ci` instala as versões do lockfile. Nenhum arquivo `.env`, conta, token ou chave de API precisa ser configurado. O [.env.example](.env.example) contém somente um valor público vazio para referência futura.

Abra o endereço local mostrado no terminal (geralmente `http://localhost:5173`). Encerre com `Ctrl+C`. Usar `npm.cmd` evita o bloqueio de `npm.ps1` por políticas do PowerShell, sem alterar a política de segurança do Windows. Em outros terminais, `npm` também pode ser usado.

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

`check` também aplica as migrações no D1 **local**, verifica os tipos do Worker e compila o backend em dry-run. `npm.cmd run test:backend` executa somente os testes de backend. Esses testes usam o runtime local do Wrangler, com bindings remotos desativados; não comprovam login, CSRF ou logout implementados. O primeiro `npm.cmd ci` precisa de internet para baixar dependências.

Para reexecutar testes durante a edição, use `npm.cmd run test:watch`. Para auditoria de vulnerabilidades conhecidas, use `npm.cmd audit`; essa consulta requer internet e não substitui revisão de segurança.

Os testes de exportação simulam Canvas e download: validam a lógica, mas não comprovam pixels, codificação dos arquivos ou gravação real no Windows. A conferência manual PNG/JPEG no navegador e, futuramente, no WebView2 continua necessária.

`npm.cmd run build` gera a interface estática em `dist/`. Para conferi-la localmente, execute `npm.cmd run preview` após o build e abra o endereço informado. **Ainda não há instalador Windows.** Tauri e integrações reais permanecem no [planejamento](docs/ROADMAP.md).

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

A análise é um registro da etapa anterior. A preparação de publicação acrescentou ESLint, testes automatizados e CI. Login Steam, banco online, consultas externas reais e instalador continuam fora desta etapa.

### Preparação da biblioteca Steam

A [camada de integração Steam](docs/STEAM_LIBRARY.md) agora inclui contratos, validação de respostas, provedor de biblioteca e cliente exclusivo do servidor para GetOwnedGames, GetPlayerAchievements e GetSchemaForGame. Há tratamento de privacidade ambígua, respostas incompletas, indisponibilidade, limites, timeout e cancelamento. A interface usa o contrato de provedor, preservando o demo como padrão e sem alterar o layout.

**Não há consulta real ativa, login ou chave configurada.** Os testes usam somente dados sintéticos e rede simulada. Não configure chave em `VITE_*` nem importe o cliente de servidor na aplicação. A elegibilidade da conta do operador, backend seguro, autorização, política de privacidade, cache e limites globais ainda precisam ser concluídos antes do uso real. Os dados e termos da Steam não são cobertos pela licença MIT do projeto.

### Preparação do backend e autenticação

O Worker local usa Hono e binding D1 emulado, com migrações para revisar o esquema original e preparar sessões, tentativas, nonces e códigos desktop. Essas tabelas não habilitam login ou acesso privado. [AUTHENTICATION](docs/AUTHENTICATION.md) define a proposta OpenID 2.0, retorno Tauri com prova de posse, sessões revogáveis, CSRF e isolamento, além dos requisitos que ainda precisam ser comprovados. Não foram criados serviços remotos nem configurados segredos reais.

## Licença

O código original do projeto está sob a [licença MIT](LICENSE), escolhida pelo responsável nesta preparação do primeiro commit. As dependências mantêm suas próprias licenças; veja as atribuições e a revisão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Preserve esses avisos ao redistribuir o projeto ou seus artefatos.

## Aviso

Projeto independente e não afiliado à Valve/Steam, Nuuvem ou Eneba. Nomes de jogos, preços, histórico, contas e conquistas desta versão são fictícios.
