# Desktop Windows — Tauri 2 demonstrativo

**Adendo atual:** a [demonstração de pareamento na interface](DESKTOP_PAIRING_UI.md) está disponível somente por `npm.cmd run desktop:demo` em Windows debug. Reutiliza o laboratório, abre o navegador padrão e expõe quatro comandos IPC específicos com ACL local; não implementa Steam, sessões ou acesso privado. `desktop:dev`, `desktop:build` e `desktop:bundle` continuam sem a ponte. As afirmações históricas de zero IPC abaixo referem-se aos builds normais, não à configuração opt-in.

Preparação posterior de segurança: [DESKTOP_PAIRING](DESKTOP_PAIRING.md) descreve o executável de laboratório separado, aberto por `npm.cmd run desktop:pairing` e testado por `npm.cmd run desktop:pairing:test`. Não aparece no aplicativo, não usa WebView2 para autenticação, não altera CSP/capabilities e não habilita login. Os resultados históricos abaixo não comprovam o protocolo futuro de autenticação.

O Tauri envolve a interface React/Vite existente sem recriá-la. Biblioteca, conquistas, promoções, desejos e exportação continuam no modo demonstrativo. Não há login, backend iniciado pelo executável, Steam dentro do WebView, consultas externas ou serviço pago.

Evolução posterior: a [Fase 1 visual](VISUAL_DESIGN.md) redesenha somente biblioteca e navegação; registra 406 testes npm, novo build release e conferência no WebView2, sem alterar Rust, CSP ou capacidades. Os resultados de integração descritos abaixo são da etapa anterior e não aprovam a instalação ou novas funcionalidades.

## Pré-requisitos e resultado da inspeção

Inspeção local atualizada após a instalação dos pré-requisitos pelo responsável (Windows x64):

| Componente | Resultado |
| --- | --- |
| Node/npm | 24.22.1 / 11.19.1 |
| WebView2 | Evergreen 155.0.4283.62 encontrado |
| Rust / Cargo | 1.99.1 / 1.99.1 |
| rustup / toolchain | 1.29.2 / stable-x86_64-pc-windows-msvc |
| Visual Studio Build Tools | MSVC/SDK reconhecidos pelo Tauri; builds Windows aprovados |

`npm.cmd run desktop:info` reproduz o diagnóstico. A inspeção anterior encontrou pré-requisitos ausentes; esse bloqueio foi resolvido. A ausência de `cl.exe` no PATH de um PowerShell comum, sozinha, não comprova ausência de C++. Não foi instalado software de sistema automaticamente pelo agente.

Siga os [pré-requisitos oficiais Tauri 2](https://v2.tauri.app/start/prerequisites/#windows):

1. Abra o Visual Studio Installer, escolha **Modificar** em Build Tools e marque **Desenvolvimento para desktop com C++**. Inclua MSVC x64/x86 e um Windows 10/11 SDK compatível. Se não houver Installer, obtenha o [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). Não basta instalar somente o Visual C++ Redistributable.
2. Instale Rust estável pelo instalador oficial [rustup](https://rustup.rs/), usando o host MSVC (`x86_64-pc-windows-msvc` neste Windows x64). Não selecione GNU/MinGW para este projeto. O rustup instala rustc e Cargo; instale também os componentes rustfmt e clippy se não estiverem no perfil padrão.
3. WebView2 já está disponível aqui. Em outro Windows sem o runtime, use o **Evergreen Runtime** no [download oficial Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/), não apenas o navegador Edge. Instaladores de terceiros não são necessários.
4. Reabra o VS Code/PowerShell para atualizar PATH. Confirme `rustc --version`, `cargo --version`, `rustup show` e `npm.cmd run desktop:info`.

São ferramentas disponíveis sem assinatura/serviço pago obrigatório. A primeira instalação npm, resolução Cargo e futura preparação NSIS precisam de internet e espaço em disco; não solicitam credenciais Steam. O SDK WebView2/Build Tools mantém seus próprios termos Microsoft.

## Abrir o aplicativo durante o desenvolvimento

Na raiz do repositório, após instalar os pré-requisitos:

```powershell
npm.cmd ci
npm.cmd run desktop:info
npm.cmd run desktop:dev
```

O Tauri executa `npm run dev` automaticamente, espera `http://127.0.0.1:5173` e abre **Steam Companion · Demonstração**, janela de 1280×820 com tamanho mínimo 960×640 e decoração nativa. Encerre pelo terminal com Ctrl+C. Feche outra instância do Vite nessa porta antes de iniciar; strictPort impede trocar silenciosamente a porta. Nenhum servidor fica exposto à rede local.

Para usar somente o navegador, continue com `npm.cmd run dev`. O Worker é opcional e independente; não há conexão desktop → Worker nesta etapa. Nenhum `.env`, token ou conta é necessário.

## Executável local e instalador

```powershell
npm.cmd run desktop:check
npm.cmd run desktop:build
.\src-tauri\target\release\steam-companion.exe
```

`desktop:check` executa rustfmt --check, cargo check e cargo test. `desktop:build` faz o build Vite e o build release Tauri **sem bundle/instalador**; não publica nada. O [Cargo.lock](../src-tauri/Cargo.lock) foi gerado pelo Cargo e incluído no versionamento; fixa também dependências transitivas. Check/test/build/bundle usam `--locked` e falham se a resolução exigir atualizar o lock. O release usa os arquivos Vite incorporados; funciona sem Vite, Node ou Worker em execução.

Para gerar NSIS localmente, sem iniciar o instalador:

```powershell
npm.cmd run desktop:bundle
```

Foi gerado `src-tauri/target/release/bundle/nsis/Steam Companion_0.1.0_x64-setup.exe` (aproximadamente 1,88 MiB), com instalação por usuário. A CLI baixou as ferramentas NSIS e verificou seus hashes; **não executou o instalador**. A configuração permite bootstrapper oficial Evergreen caso falte WebView2 no destino; esse caminho exige internet. O identificador `app.steamcompanion.prototype` é provisório e precisa ser decidido antes de distribuição persistente. Não há assinatura, updater, upload ou release configurados. Revise [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md), licenças nativas, testes Windows e avisos SmartScreen antes de compartilhar; não desative proteções do Windows. Compilar NSIS não comprova instalação/desinstalação ou comportamento em outra máquina.

## Limites de segurança

- [Capacidade main-demo](../src-tauri/capabilities/main-demo.json): apenas janela main, conteúdo local, **lista de permissões vazia**, sem escopo remoto. Não conceder core:default por conveniência. Não foram adicionados plugins fs, shell, opener, http, dialog, deep-link ou updater, API JavaScript Tauri ou comandos invoke da aplicação.
- [Configuração](../src-tauri/tauri.conf.json): somente assets de `dist/`; protocolo de arquivos locais desativado e nenhuma sidecar. LICENSE e THIRD_PARTY_NOTICES são os únicos recursos extras.
- CSP release: scripts/styles locais, nenhum connect-src, objeto, frame ou formulário. Atributos style são permitidos para preservar gradientes e barras já usados pelo React; isso não autoriza JavaScript inline. A modificação de CSP por hashes/nonces do Tauri não foi desativada.
- CSP dev: exceção de script/style inline necessária para React Refresh/Vite; conexão somente à própria origem e WebSocket de HMR no loopback. O Vite também entrega essa política por header. Não há unsafe-eval ou liberação genérica HTTPS. Essa exceção não é incluída na política release.
- [Restrições Rust](../src-tauri/src/security.rs): dev somente origem exata 127.0.0.1:5173; release somente origem interna HTTPS tauri.localhost; userinfo é rejeitado e novas janelas são negadas. Isso bloqueia páginas Steam e outras páginas remotas dentro da janela. Não existe fluxo de autenticação a ser aberto externamente ainda.
- Exportação preserva Canvas → data URL PNG/JPEG → download do WebView. O handler permite somente esses dois prefixos, aceita o destino fornecido pelo runtime e não expõe leitura/gravação arbitrária por IPC, não recebe caminhos do frontend e não registra imagens. A gravação efetiva foi comprovada no WebView2 com destino temporário isolado. O handler Wry marca o download como tratado; não foi implementado diálogo próprio de salvar. O destino padrão do usuário e a interação com a lista de downloads/cancelamento ainda exigem conferência manual.
- Capabilities limitam IPC, não equivalem a sandbox de todo o processo Rust. Nem CSP nem esses testes resolvem autenticação, armazenamento seguro, callbacks ou isolamento por conta. Todos os bloqueadores de [SECURITY_REVIEW](SECURITY_REVIEW.md) continuam aplicáveis.

## Verificações aprovadas

`npm.cmd run check` continua verificando frontend e backend, incluindo testes de configuração desktop e regras de publicação. **Não executa Cargo nem comprova janela nativa.** A CI agora acrescenta no job Windows `desktop:check`, os 30 testes Rust do laboratório isolado e Clippy com avisos como erros; veja [DESKTOP_PAIRING](DESKTOP_PAIRING.md). Não abre janela, não executa os cinco cenários Edge/processos do laboratório e não gera release/instalador ou deploy. Os resultados históricos abaixo descrevem verificações locais, não uma execução remota da CI nova.

| Verificação | Resultado nesta máquina |
| --- | --- |
| `npm.cmd ci` | Instalação pelo lockfile concluída; auditoria npm sem vulnerabilidades conhecidas |
| `npm.cmd run check` | TypeScript, ESLint, migrações D1 locais e **399 testes** (169 gerais + 230 backend) aprovados; builds web/Worker dry-run aprovados |
| `npm.cmd run desktop:check` | rustfmt, cargo check e **3 testes Rust** aprovados, sem avisos |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` | Aprovado, sem avisos |
| `npm.cmd run desktop:build` | Release Windows x64 aprovado; `src-tauri/target/release/steam-companion.exe` gerado |
| `npm.cmd run desktop:bundle` | Instalador NSIS x64 gerado, sem instalação/publicação |
| `git diff --check` | Aprovado |

Os testes TypeScript de configuração verificam permissões vazias, ausência de acesso remoto/plugins, CSP, loopback e recursos sem backend. Os três testes Rust cobrem navegação dev/release e downloads, incluindo URLs falsas, credenciais sintéticas na URL, arquivo local e formatos não permitidos. Eles não simulam instalação nem são testes ponta a ponta da janela.

O import Rust não utilizado foi removido e rustfmt foi aplicado. Não houve alteração de design, dependência nova nesta finalização, frontend, Worker, D1 ou OpenID. O bundle React manteve os mesmos hashes/arquivos da etapa anterior. Total de testes unitários/integrados: **402** (399 npm + 3 Rust), além da conferência nativa abaixo.

### Conferência funcional no WebView2 real

O executável release foi iniciado com perfil WebView2 temporário isolado, sem Vite/Worker. A janela visível e o conteúdo do WebView foram conferidos via diagnóstico local do WebView2; scripts temporários de teste acionaram os controles DOM reais, sem mock de Canvas, download ou filesystem. A captura da tela inicial também foi inspecionada. Isso não é uma suíte E2E versionada nem execução da CI.

| Comportamento | Evidência |
| --- | --- |
| Janela | Título nativo Steam Companion · Demonstração, viewport inicial 1280×820, origem interna HTTPS e quatro jogos fictícios |
| Biblioteca | Busca por Nebula, filtro 100% concluídos e ordenação Nome A–Z aprovados |
| Conquistas | Detalhes de Nebula Drift exibiram quatro conquistas |
| Navegação/desejos | Promoções com cinco ofertas e aviso fictício; inclusão/remoção em desejos; perfil acessível |
| Exportação PNG/JPEG | Arquivos efetivamente gravados em pasta temporária, com nomes esperados e 1200×630; formatos decodificados pelo Windows e PNG inspecionado visualmente com aviso de demonstração |
| Redimensionamento | Janela redimensionada para 1100×740; viewport mudou para 1084×701, mantendo interface acessível |
| Login | Elemento Entrar com Steam manteve aria-disabled=true, sem formulário de credenciais |
| Segurança | Navegação para example.invalid e popup negados; fetch externo bloqueado pela CSP; nenhum erro JS ou violação CSP durante o fluxo normal |

Para automatizar somente essa conferência, o processo de teste recebeu depuração WebView2 via loopback e pasta temporária de perfil/download. **Essas opções não foram adicionadas ao código, scripts npm ou configuração do aplicativo**, nem persistidas no Windows. O processo e a porta de diagnóstico foram encerrados ao terminar. Referência: [diagnóstico oficial WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code). Não habilitar depuração remota para distribuir o aplicativo.

O destino do download foi configurado pela ferramenta de diagnóstico para não escrever sobre exportações pessoais. Portanto, os formatos e a gravação nativa foram comprovados; o fluxo com destino padrão do Windows continua na lista manual. A abertura em desenvolvimento também foi relatada pelo responsável; a conferência automatizada desta etapa usou o release.

## Verificações manuais ainda pendentes

Não foram aprovados por inferência os itens abaixo:

1. Execute desktop:dev e o executável release normalmente. Em cada um, abra um jogo, exporte PNG/JPEG e confira a pasta padrão/lista de downloads do WebView2, abertura no Fotos/Paint e comportamento de cancelamento/arquivo já existente. Não se deve esperar um diálogo próprio de salvar que não foi implementado.
2. Arraste as bordas até o mínimo 960×640, maximize/restaure, teste escalas de tela 125%/150%, rolagem, foco e navegação por teclado. Houve prova programática de redimensionamento; essas combinações não foram todas testadas.
3. Adicione um desejo, feche e reabra: a lista deve voltar vazia, pois permanece em memória. Confira também fechar/reabrir sem processo/porta Vite restante no modo dev.
4. Quando autorizar um teste de instalação, use uma VM/Windows limpo e o NSIS gerado: conferir instalação por usuário, atalhos, inicialização, desinstalação e máquinas com/sem WebView2. Esse teste **não foi executado** e não deve ser substituído pelo sucesso do makensis.
5. Antes de redistribuir, concluir os textos/NOTICE e obrigações das crates nativas (incluindo fontes MPL), decidir identificador definitivo, revisar retenção de dados locais e produzir hashes. Binário/instalador não estão assinados; autenticação, sessão segura, integração Steam e persistência continuam fora desta etapa.

O ícone geométrico original tem fonte em [source.svg](../src-tauri/icons/source.svg). PNG/ICO são assets versionados, gerados pela CLI Tauri a partir dessa fonte; não contêm marca gráfica Steam. Target e schemas gerados são ignorados; Cargo.lock não é ignorado.

Referências: [Vite com Tauri](https://v2.tauri.app/start/frontend/vite/), [capabilities](https://v2.tauri.app/security/capabilities/), [CSP](https://v2.tauri.app/security/csp/), [instalador Windows](https://v2.tauri.app/distribute/windows-installer/).
