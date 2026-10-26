# Avisos de terceiros e revisão de licenças

Revisão atualizada para a integração desktop, em 2026. Fonte npm: [package-lock.json](package-lock.json) e licenças instaladas. Fonte Rust: [Cargo.lock](src-tauri/Cargo.lock) e metadados locais Cargo do alvo Windows x64, resolvidos/compilados com --locked. A CLI Tauri é somente ferramenta de desenvolvimento. Foi feito inventário básico das declarações Rust; reunir textos/NOTICE e cumprir obrigações de redistribuição nativa continua pendente antes de compartilhar binário/instalador.

## Escopo e conclusão

A [licença MIT do projeto](LICENSE) cobre o código original do Steam Companion. Ela não substitui licenças, direitos autorais ou marcas dos fornecedores. Não foi identificado impedimento para aplicar MIT ao código original com as dependências atuais, preservando as obrigações de terceiros.

As dependências npm de execução usam MIT e ISC. Ferramentas e dados de desenvolvimento usam também Apache-2.0, BSD/0BSD, BlueOak-1.0.0, MIT-0, CC-BY-4.0, CC0-1.0 e componentes LGPL-3.0-or-later do processamento de imagens local. As entradas do lockfile npm foram verificadas: todas declaram licença. Hono integra somente o bundle do Worker. As ferramentas não são incorporadas como aplicações ao bundle React/Worker; não se deve relicenciar seus arquivos ou bancos de dados como MIT. O binário Tauri tem dependências Rust próprias; o inventário básico abaixo não conclui os avisos e obrigações de redistribuição nativa.

Não há capas, fontes remotas, guias copiados ou dados Steam/lojas no protótipo. As formas das capas são desenhadas localmente e os jogos são fictícios. Os ícones Lucide são conteúdo de terceiros e estão atribuídos abaixo.

Ao redistribuir o código ou os arquivos web compilados, inclua este arquivo e LICENSE junto à distribuição e preserve os avisos incorporados. Se passar a distribuir node_modules, ferramentas, dados ou um instalador, inclua também os textos/NOTICE aplicáveis desses componentes. Refaça a revisão ao mudar dependências ou incluir conteúdo externo.

## Dependências de execução

| Pacote | Versão | Licença declarada |
| --- | --- | --- |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| scheduler | 0.28.0 | MIT |
| lucide-react | 0.468.0 | ISC |
| hono | 4.13.14 | MIT |

## Ferramentas diretas de desenvolvimento

| Pacote | Versão | Licença declarada |
| --- | --- | --- |
| @cloudflare/workers-types | 5.20261026.1 | MIT OR Apache-2.0 |
| @tauri-apps/cli | 2.12.4 | Apache-2.0 OR MIT |
| @eslint/js | 10.0.1 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| @testing-library/jest-dom | 7.0.1 | MIT |
| @testing-library/react | 16.3.3 | MIT |
| @testing-library/user-event | 14.6.8 | MIT |
| @types/node | 24.19.2 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @vitejs/plugin-react | 4.7.0 | MIT |
| eslint | 10.13.0 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | MIT |
| eslint-plugin-react-refresh | 0.5.7 | MIT |
| globals | 17.13.0 | MIT |
| ignore | 7.0.14 | MIT |
| jsdom | 30.1.3 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| typescript-eslint | 8.72.0 | MIT |
| vite | 6.4.5 | MIT |
| vitest | 4.1.12 | MIT |
| wrangler | 4.152.0 | MIT OR Apache-2.0 |

## Inventário transitivo do lockfile

Os números contam entradas, incluindo variantes opcionais de plataforma e versões aninhadas; não equivalem ao número de pacotes instalados em cada sistema.

| Licença declarada | Entradas |
| --- | --- |
| 0BSD | 1 |
| Apache-2.0 | 40 |
| Apache-2.0 OR MIT | 12 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| BlueOak-1.0.0 | 4 |
| BSD-2-Clause | 8 |
| BSD-3-Clause | 3 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 2 |
| ISC | 14 |
| LGPL-3.0-or-later | 10 |
| MIT | 300 |
| MIT-0 | 2 |
| MIT OR Apache-2.0 | 4 |

- **Apache-2.0:** por exemplo TypeScript e componentes ESLint. Mantenha licença, avisos e NOTICE quando existirem ao redistribuir esses componentes. [Texto Apache](https://www.apache.org/licenses/LICENSE-2.0).
- **Playwright:** `@playwright/test`, `playwright` e `playwright-core` 1.64.1 são ferramentas de teste sob Apache-2.0, sem inclusão no bundle da aplicação. Preserve LICENSE e NOTICE desses pacotes caso os redistribua; o NOTICE atribui código derivado do Puppeteer. No Windows os testes usam Edge instalado separadamente; no Linux, Chromium obtido pelo Playwright mantém suas próprias licenças/avisos. Não são incluídos no aplicativo ou publicados pelo projeto.
- **Tauri:** CLI 2.12.4 e seus binários opcionais declaram Apache-2.0 OR MIT; textos em `node_modules/@tauri-apps/cli/LICENSE-*` e [fonte oficial](https://github.com/tauri-apps/tauri). O lockfile Rust fixa tauri 2.12.5, tauri-build 2.7.4 e wry 0.57.1 sob MIT/Apache-2.0; tao 0.37.2 declara Apache-2.0. Os metadados transitivos incluem também MIT, BSD, Zlib, Unicode-3.0 e MPL-2.0. cssparser 0.37.0, cssparser-macros 0.7.1, dtoa-short 0.3.5, option-ext 0.2.0 e selectors 0.38.0 declaram MPL-2.0: preserve as licenças e disponibilize os fontes cobertos conforme suas obrigações antes de redistribuir. Não foram modificadas crates de terceiros. O instalador local inclui LICENSE e este documento; isso não substitui reunir os textos/NOTICE nativos e os termos WebView2. O ícone geométrico original foi criado para este projeto, sem usar marca gráfica da Steam.
- **BlueOak-1.0.0:** minimatch e versões aninhadas de lru-cache, usados no desenvolvimento. Ao redistribuí-los, preserve o texto ou o [link exigido pela licença Blue Oak](https://blueoakcouncil.org/license/1.0.0).
- **CC-BY-4.0:** dados de caniuse-lite, versão 1.0.30001819, usados pelas ferramentas de compatibilidade. Fonte: [caniuse-lite](https://github.com/browserslist/caniuse-lite), com dados de [Can I use](https://caniuse.com/), sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Não foram modificados nesta revisão; atribuição e indicação de alterações são necessárias ao redistribuir/adaptar esses dados.
- **CC0-1.0:** mdn-data, usado no desenvolvimento, mantém sua [dedicação CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **MIT, MIT-0, ISC e BSD:** preserve os avisos exigidos pelo texto de cada pacote ao redistribuí-lo. MIT-0 não exige atribuição. As licenças permanecem disponíveis nos pacotes instalados.
- **MIT OR Apache-2.0:** ferramentas Cloudflare e tipos Workers oferecem alternativa de licença. Preserve os textos/avisos do componente caso suas ferramentas sejam redistribuídas. Fontes: [workers-sdk](https://github.com/cloudflare/workers-sdk) e [workerd](https://github.com/cloudflare/workerd).
- **LGPL-3.0-or-later e expressões AND:** Wrangler/Miniflare incluem Sharp e binários opcionais de libvips para emulação local. Os dez pacotes `@img/sharp-libvips-*` usam LGPL; as quatro variantes Sharp Windows/Wasm combinam licenças. Não integram o código ou bundle do aplicativo nesta etapa. Não redistribuímos esses binários: `npm ci` os obtém dos fornecedores. Antes de empacotar ferramentas ou `node_modules`, revisar e cumprir as obrigações específicas de LGPL/GPL incorporada, código-fonte correspondente, avisos e bibliotecas incluídas. Ver [licenciamento Sharp](https://sharp.pixelplumbing.com/install/#licensing) e os arquivos de licença dos respectivos pacotes; este inventário não relicencia esses componentes.

## React, React DOM e Scheduler — MIT

Fonte: os arquivos LICENSE dos pacotes react, react-dom e scheduler instalados. Os três têm o mesmo texto:

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Lucide React — ISC

Fonte: arquivo LICENSE de lucide-react 0.468.0:

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

O aviso de Lucide identifica partes originadas de Feather sob MIT. Para preservar também a permissão MIT desses ícones, segue seu texto com a atribuição informada por Lucide:

```text
MIT License

Copyright (c) 2013-2022 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Hono - MIT

Fonte: arquivo LICENSE de hono 4.13.14, incorporado ao bundle Worker.

```text
MIT License

Copyright (c) 2021 - present, Yusuke Wada and Hono contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
