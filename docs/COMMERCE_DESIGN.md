# Fase 3 — Promoções e Lista de desejos

## Escopo e referência

Esta etapa aplica somente às duas telas a identidade já aprovada das [Fases 1](VISUAL_DESIGN.md) e [2](GAME_DETAIL_DESIGN.md): preto/grafite, Segoe UI Variable/Segoe UI, tipografia legível, separações finas, painéis compactos e cantos discretos. A inspiração é o [SpaceTheme para Steam](https://github.com/SpaceTheme/Steam), especialmente suas capturas oficiais de [loja](https://raw.githubusercontent.com/SpaceTheme/Steam/main/.github/assets/preview/storePage.webp) e [desejos](https://raw.githubusercontent.com/SpaceTheme/Steam/main/.github/assets/preview/storeWishlist.webp): capas como elementos principais e linhas com informações e ações bem agrupadas.

Não foram copiados código, CSS, capturas, logotipos ou artes desse tema ou da Steam. Os banners/cápsulas reutilizam as [artes demonstrativas originais](../src/assets/demo/) do projeto, conforme [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md). Não é necessário instalar Millennium, baixar fontes ou consultar uma API.

## Componentes e isolamento

- [DealsPage](../src/commerce/DealsPage.tsx): cabeçalho, busca por título, loja, filtro de desejos e estados vazios.
- [OfferComparison](../src/commerce/OfferComparison.tsx): banner e ofertas por loja para o mesmo jogo, valores em reais, descontos e verificações pendentes.
- [WishlistPage](../src/commerce/WishlistPage.tsx): cápsulas, ofertas demonstrativas, filtros, comparação, remoção e lista vazia.
- [CommerceParts](../src/commerce/CommerceParts.tsx): aviso de simulação, busca, botão de coração e estado vazio reutilizáveis.
- [OfferArtwork](../src/commerce/OfferArtwork.tsx): reutilização das artes locais por título fictício, com alternativa neutra quando a arte não existe.
- [demoOffers](../src/commerce/demoOffers.ts): agrupamento e menor preço demonstrativo disponível, sem mutar os dados.
- [commerce.css](../src/styles/commerce.css): estilos limitados às novas telas, com os tokens existentes. Sem mudanças nos estilos da biblioteca, página individual ou tokens globais.

A [integração no App](../src/App.tsx) substitui somente a apresentação dessas telas. Biblioteca, favoritos e desejos continuam distintos. A seleção de desejos mantém a identidade por título, compartilhada entre lojas, apenas em memória e reiniciada ao recarregar. A busca de ofertas é separada da busca/filtros da biblioteca. Não há persistência, sincronização, backend ou alerta de preço novo.

Não houve alteração em Workers, D1, OpenID, contratos de dados, exportação, configuração Rust, CSP ou capacidades do Tauri. Nenhuma dependência foi adicionada. O foco de teclado existente permanece visível; ao remover um desejo, o foco vai para o título estável da tela, inclusive após remover o último jogo.

O responsável aprovou as duas telas. Na revisão final de legibilidade, os avisos secundários de preço/taxas, histórico real indisponível e marcadores de demonstração passaram de 10–11 px para o token existente de 12 px. Descontos, mínimos ilustrativos e informações de ativação/taxas já usavam 12 px e foram preservados, assim como preços principais, layout e demais telas.

## Preços e informações indisponíveis

Os cinco registros de [demoDeals](../src/demo.ts) e seus valores permanecem inalterados. Os avisos destacam que jogos, preços e descontos são fictícios e que nenhuma compra ocorre. A comparação e o menor valor exibido consideram os filtros selecionados; não representam preço final com taxas, disponibilidade comercial ou mínimo histórico confiável.

Os valores `historicLowBRL` existentes aparecem como **mínimos ilustrativos**, sempre acompanhados de “Histórico real indisponível”. Sem esse campo, aparece “Histórico indisponível”. Não são inventados preço anterior, percentual, fonte, URL ou histórico real. Valores ausentes/inválidos não viram zero; um zero explicitamente conhecido permanece zero.

Ativação no Brasil e taxas aparecem como **não verificadas**, mesmo que flags sintéticas sejam verdadeiras: um dado demonstrativo não comprova compatibilidade real. Na lista de desejos, “Com ofertas demo” significa somente existência de registros locais, não estoque ou disponibilidade real. Um jogo sem ofertas tem preço indisponível. Alertas são uma reserva visual explicitamente indisponível, sem controles que prometam um envio.

## Como avaliar

```powershell
# Navegador: http://127.0.0.1:5173
npm.cmd run dev

# Ou janela Windows; não execute ambos na mesma porta
npm.cmd run desktop:dev
```

Abra **Promoções**, busque um jogo, filtre uma loja e use o coração para adicionar desejos. Abra **Lista de desejos**, experimente busca/disponibilidade, compare as ofertas e remova os jogos até obter o estado vazio. Verifique também navegação com Tab/Shift+Tab, Enter/Space, redimensionamento e os avisos de preços fictícios. Recarregar deve limpar os desejos, como antes.

```powershell
npm.cmd run check
npm.cmd run test:browser -- tests/browser/commerce.spec.ts
npm.cmd run desktop:build
```

O executável release fica em `src-tauri/target/release/steam-companion.exe`. Veja [DESKTOP](DESKTOP.md) para pré-requisitos. Não há necessidade de iniciar o backend.

## Validação e limites

- `npm.cmd run check`: aprovado, com TypeScript frontend/backend, ESLint sem avisos, migrações D1 locais e builds Vite/Worker (somente dry-run, sem deploy).
- **478 testes aprovados**: 209 de aplicação/regras/exportação, 230 do backend e 39 Playwright. Os 16 novos testes de componente/regras e nove de navegador cobrem as duas telas, agrupamento sem mutação, preços ausentes/inválidos, filtros combinados, comparação, desejo único entre lojas, recarga, teclado e foco após remoção. As regressões da biblioteca e da página individual, incluindo PNG/JPEG reais, continuaram passando.
- Navegador Chromium/Microsoft Edge no Windows: cliques reais e ausência de transbordamento horizontal nas larguras 320, 375, 640, 960, 1280, 1440 e 1920 px. Capturas de desktop e janela estreita das duas telas foram inspecionadas. As novas telas não fizeram requisições externas durante esses testes.
- `npm.cmd run desktop:build`: aprovado em Windows, gerando o executável release. Não foi gerado nem instalado um instalador nesta fase.
- **WebView2 real do executável Tauri**: navegação, pesquisa, loja, filtro de desejos/disponibilidade, comparação, adição/remoção, lista vazia, acionamento por mouse/Enter/Space e foco comprovados com Playwright via CDP temporário. As mesmas sete larguras foram verificadas por emulação do viewport dentro do WebView2; a janela nativa também foi redimensionada para 1100 × 740 (viewport 1084 × 701), sem transbordamento horizontal. As capturas de 1440/375 px foram inspecionadas. Login permaneceu desativado; não foram observadas exceções JavaScript nem violações CSP durante o roteiro. Perfil e arquivos de evidência ficaram em pasta temporária fora do repositório; as opções de depuração não fazem parte da configuração do aplicativo.
- `git diff --check`: aprovado. Revisão de arquivos candidatos não encontrou credenciais reais ou arquivos privados novos; as URLs com usuário/senha fictícios encontradas em testes de segurança anteriores são casos negativos inalterados.

Os testes locais de interface e o roteiro nativo são evidências distintas: a suíte Playwright do repositório executa Chromium, enquanto o roteiro complementar foi executado no WebView2 desta máquina. Não representam certificação em todos os ambientes Windows. Testes com dados locais não validam preços, disponibilidade ou integrações reais.

Permanecem pendentes leitor de tela real, escalas Windows 125%/150%, alto contraste e matriz ampliada de hardware/WebView2. Login, consultas às lojas, histórico confiável, confirmação de ativação/taxas, alertas e sincronização permanecem fora desta etapa. A aprovação visual autoriza encerrar a fase com commit local após as verificações; não houve deploy ou push.
