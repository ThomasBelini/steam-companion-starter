# Redesenho visual — Fase 1

Escopo: biblioteca principal e navegação do Steam Companion. O protótipo continua gratuito, local e demonstrativo. A página individual do jogo não foi redesenhada; capa, conquistas e exportação dessa página permanecem com a apresentação anterior. O ajuste do botão Voltar serve somente à navegação/foco por teclado.

## Referência e recursos

Foram examinadas as capturas oficiais [Library Home](https://raw.githubusercontent.com/SpaceTheme/Steam/main/.github/assets/preview/libHome.webp) e [Library Gamepage](https://raw.githubusercontent.com/SpaceTheme/Steam/main/.github/assets/preview/libGamepage.webp), indicadas no [repositório SpaceTheme/Steam](https://github.com/SpaceTheme/Steam). A referência orienta a composição de prateleiras, menu estreito, fundos escuros, painéis modulares e separadores discretos. Gamepage foi estudada para continuidade futura; a Fase 2 não foi implementada.

A [licença MIT do SpaceTheme](https://github.com/SpaceTheme/Steam/blob/main/LICENSE) foi consultada. Nenhum CSS, logo, ícone ou arte foi copiado do tema ou das capturas; a licença do tema não foi usada para presumir direitos sobre capas de jogos de terceiros. Millennium não foi instalado nem virou dependência.

As quatro [artes SVG demonstrativas](../src/assets/demo/) foram desenhadas originalmente para os jogos fictícios Nebula Drift, Forestbound, Chrono Vale e Steel Horizon, usando geometria e paisagens vetoriais. São arquivos locais sob a [licença do projeto](../LICENSE), sem fontes remotas ou conteúdo baixado de jogos. Os ícones continuam usando Lucide, já atribuído em [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md). Gradientes de iluminação aparecem nas ilustrações; os painéis e controles da biblioteca usam cores sólidas de grafite/preto.

## Organização implementada

- [Tokens](../src/styles/tokens.css): paleta neutra, espaçamentos, bordas finas, raios pequenos, tipografia, foco e transições.
- [CSS da Fase 1](../src/styles/library.css): menu lateral, barra superior, prateleiras, capas, estados interativos e breakpoints. O [CSS anterior](../src/styles.css) foi preservado para as demais páginas.
- [LibraryHome](../src/library/LibraryHome.tsx): banner panorâmico, seleção de destaque, favoritos, resumo compacto de conquistas, coleção completa e filtros.
- [LibraryArtwork](../src/library/LibraryArtwork.tsx) e [metadados demo](../src/library/demoPresentation.ts): imagens fictícias separadas dos contratos de dados Steam. Outro provedor não recebe capas ou histórico fictício por coincidência de AppID.
- [App](../src/App.tsx): mantém a consulta por provedor, cancelamento, filtros/ordenação e desejos existentes; acrescenta estado visual de favoritos por AppID, navegação lateral e encaminhamento do foco ao título.

Favoritos pertencem somente à sessão em memória e são independentes dos desejos. No demo, Nebula Drift e Forestbound começam marcados como exemplos; alterações se perdem ao recarregar. Não há localStorage, sincronização, banco novo ou identidade autenticada.

Recentes usam uma ordem ilustrativa explícita do demo, sem datas inventadas ou alegação de histórico da Steam. Trocar o destaque altera apenas o banner; Ver conquistas abre a página existente. Outro provedor não apresenta essa prateleira sem dados adequados.

Busca/filtros se aplicam à coleção completa. Durante uma busca ou filtro de conclusão, as prateleiras de recentes/favoritos são ocultadas para não misturar jogos fora do resultado. Limpar busca e filtros restaura a coleção e os favoritos da sessão. Dados desconhecidos/indisponíveis continuam distintos de zero ou biblioteca vazia.

## Acessibilidade e adaptação

Há atalho Pular para o conteúdo, navegação com aria-current, botões de favorito com estado pressionado e nomes explícitos, regiões nomeadas e foco no título após navegar. A estrela é um botão separado do botão que abre o jogo, sem controles interativos aninhados. Estados vazios oferecem orientação e limpeza dos filtros. As imagens são decorativas para leitores de tela, pois os títulos já estão presentes no texto.

Hover discreto, contorno de foco de 2 px e seleção usam os tokens neutros. prefers-reduced-motion remove animações/transições. Em larguras intermediárias o menu se reduz a ícones com nomes acessíveis; nas menores vira uma faixa superior. A grade usa duas colunas no modo estreito. Foi corrigida uma rolagem horizontal herdada do mínimo do body em 320 px, apenas quando a biblioteca está presente.

## Validação desta etapa

| Verificação | Resultado |
| --- | --- |
| `npm.cmd ci` | Concluído, sem dependências novas; auditoria npm sem vulnerabilidades conhecidas |
| Testes frontend direcionados | 40 testes em quatro arquivos, incluindo os sete novos casos de organização/foco |
| `npm.cmd run check` | 406 testes (176 gerais + 230 backend), TypeScript, ESLint, migrações locais e builds aprovados |
| `npm.cmd run desktop:build` | Release Windows gerado com lockfile, sem instalador/deploy |
| `git diff --check` | Aprovado |

No navegador foram exercitados busca sem distinção de maiúsculas, filtro combinado, estado vazio/limpeza, favorito por Espaço, desejos, navegação, foco de ida/volta, hover e movimento reduzido. O foco visível manteve contorno de 2 px, e o modo de movimento reduzido retornou transição de 0 s.

No **WebView2 real do executável release** foram conferidos carregamento das quatro artes, destaque, busca, filtro, ordenação, conquistas, favoritos por teclado, lista vazia de favoritos sem excluir jogos, promoções, inclusão/remoção de desejos e login desabilitado. O atalho de conteúdo funcionou por Enter. PNG e JPEG foram efetivamente gravados em pasta temporária, com nomes e dimensões 1200×630 corretos. A janela visível foi redimensionada para 1100×740, refletindo novo viewport.

Viewports **emulados** de 320, 375, 640, 960, 1280 e 1440 px foram medidos no navegador e no WebView2: largura do conteúdo não excedeu a largura útil, sem rolagem horizontal. As capturas em 1440 e 375 px do WebView2 foram inspecionadas visualmente; isso não significa que todas as combinações de resolução/DPI foram aprovadas. O tamanho mínimo nativo do Tauri permanece 960×640.

Não houve exceção JavaScript ou violação CSP durante o fluxo normal no release. Navegação externa, popup e fetch externo continuaram bloqueados. O teste usou o diagnóstico local do WebView2 em perfil isolado; o processo/porta foram encerrados, e nenhuma opção de depuração foi adicionada ao aplicativo. Não houve mudança de CSP, capacidades, Rust, Workers, D1 ou OpenID.

## Refinamento de legibilidade

A tipografia usa `Segoe UI Variable Text`, com fallback para `Segoe UI` e a fonte do sistema. São fontes locais do Windows; não foi incorporada Inter/Manrope, baixada fonte remota nem adicionada dependência. O refinamento mantém a estrutura, a paleta grafite e as artes da Fase 1.

A base passou de 13 para 15 px, com entrelinha de 1,5. O título da biblioteca usa 32 px/700; navegação, busca e filtros usam 14 px/600; títulos de seção usam 16 px/700; títulos dos cards usam 15 px/700 e metadados 12 px/600. Estatísticas usam 24 px/700. Textos auxiliares ficaram mais claros e menos espaçados. O banner perdeu o peso excessivamente fino; as capas preservam a fonte serifada, agora em negrito.

As regras responsivas mantêm tamanhos legíveis em vez de reduzir textos a 7–10 px. Quebras de linha acomodam rótulos e metadados; em larguras até 420 px os filtros ocupam linhas próprias. Não houve mudança de regras de negócio, exportação, backend ou configuração nativa.

O refinamento passou novamente em `npm.cmd run check` (406 testes) e na compilação Windows. No navegador foram medidos tamanhos/pesos, ausência de rolagem horizontal entre 320 e 1440 px, estado vazio, filtro e favorito por teclado com foco de 2 px. No WebView2 do release foram exercitados os fluxos demonstrativos, exportação efetiva PNG/JPEG, navegação e redimensionamento; as capturas em 1440 e 375 px foram inspecionadas. Escalas Windows 125%/150% e avaliação pessoal de conforto de leitura continuam pendentes.

## Investigação do clique em Limpar busca e filtros

O erro foi reproduzido no Playwright do navegador integrado do VS Code, sem forçar cliques. No viewport de 570×780, o botão ocupava x=200,94–369,06 e y=598,59–638,19; seu centro era (285; 618,39). O cabeçalho terminava em y=253,59, e o primeiro `dd` ocupava y=225–253,59. Portanto, não havia sobreposição geométrica entre esses elementos.

A inspeção de `getBoundingClientRect`, `DOM.getContentQuads`, viewport e hit testing confirmou o botão em (285; 618,39), com escala visual e zoom CSS iguais a 1. Durante `locator.click()`, a observação temporária do hit testing no mundo isolado do Playwright registrou duas coordenadas diferentes: primeiro (285; 618,39), acertando o botão; depois (110,24; 239,20), acertando o `dd` do número 4. Nenhum `pointerdown` chegou ao botão nesse erro. A instrumentação apenas observou e retornou os resultados originais, foi removida ao fim do diagnóstico e não foi incorporada ao app.

Isso comprova uma divergência de coordenadas no caminho da automação integrada, e não uma caixa de estatística cobrindo o botão. A causa interna dessa transformação no cliente VS Code/Electron não foi corrigida neste repositório. Não seria correto alterar `z-index`, ocultar estatísticas, desativar `pointer-events`, forçar o clique ou substituir o teste de mouse por ativação programática. O CSS, a tipografia e o componente da biblioteca foram preservados nesta investigação.

Foi acrescentada uma regressão persistente em [library-filters.spec.ts](../tests/browser/library-filters.spec.ts), usando [Playwright independente](../playwright.config.ts). Antes de qualquer alteração no layout, os 21 casos já passaram no Edge: mouse, Tab/Enter e Tab/Espaço em 320×640, 375×667, 570×780, 640×640, 960×640, 1280×720 e 1440×900. O clique de mouse usa `locator.click()` com as verificações normais de visibilidade, estabilidade e recebimento de eventos do [Playwright](https://playwright.dev/docs/actionability), sem `force`, `dispatchEvent`, `element.click()` ou mudanças de CSS durante o teste. O evento observado deve ter `isTrusted=true` e `detail=1`.

Cada caso combina busca sem resultados com filtro de jogos concluídos e confirma a limpeza de ambos, o retorno dos quatro cards e das seções de recentes/favoritos. Os casos de mouse também verificam que os retângulos dos `dd` não se sobrepõem ao botão. `npm.cmd run test:browser` executa essa regressão, também incluída no `check` e na CI; o servidor exclusivo usa a porta local 4173. O Windows usa Edge instalado; Linux usa Chromium preparado conforme o README. A validação final de `npm.cmd run check` passou com **427 testes** (176 gerais, 230 backend e 21 no navegador), TypeScript, ESLint, migrações locais e builds; `git diff --check` passou. A execução remota da CI e a correção da transformação de coordenadas no navegador integrado permanecem pendentes. Não foi comprovada uma falha de clique do aplicativo em navegador independente nem foi declarada uma correção de layout inexistente.

## Como visualizar e o que ainda falta

Na raiz, execute um dos comandos, em terminais separados de testes:

```powershell
# Navegador: http://127.0.0.1:5173
npm.cmd run dev

# Ou janela Windows; inicia o Vite automaticamente
npm.cmd run desktop:dev
```

Não rode os dois simultaneamente na porta 5173. Também é possível executar `npm.cmd run desktop:build` e abrir `src-tauri/target/release/steam-companion.exe`, sem backend. As instruções de pré-requisitos estão em [DESKTOP](DESKTOP.md).

Permanecem para conferência manual: leitor de tela real, teclado em todas as combinações de páginas, escalas Windows 125%/150%, contraste alto do sistema, destino padrão/cancelamento de downloads e instalação/desinstalação. Exportações foram verificadas com destino isolado, sem sobrescrever imagens pessoais. Não foi gerado instalador nesta Fase 1.

A Fase 2 da página individual, persistência de favoritos, histórico real, autenticação e integrações externas continuam pendentes. A única nova dependência direta é o Playwright, restrito ao desenvolvimento/testes e atribuído em [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md). Não foi acrescentado serviço pago nem realizado push ou deploy; o commit local encerra a Fase 1 após aprovação do responsável.
