# Avisos de terceiros e revisão de licenças

Revisão para o primeiro commit público, em 2026. Fonte: versões e metadados do [package-lock.json](package-lock.json), licenças instaladas pelo npm e referências indicadas abaixo. Nenhum pacote foi atualizado nesta revisão.

## Escopo e conclusão

A [licença MIT do projeto](LICENSE) cobre o código original do Steam Companion. Ela não substitui licenças, direitos autorais ou marcas dos fornecedores. Não foi identificado impedimento para aplicar MIT ao código original com as dependências atuais, preservando as obrigações de terceiros.

As dependências de execução usam MIT e ISC. Ferramentas e dados de desenvolvimento usam também Apache-2.0, BSD, BlueOak-1.0.0, MIT-0, CC-BY-4.0 e CC0-1.0. As entradas do lockfile foram verificadas: todas declaram licença. As ferramentas não são incorporadas como aplicações ao bundle React; não se deve relicenciar seus arquivos ou bancos de dados como MIT.

Não há capas, fontes remotas, guias copiados ou dados Steam/lojas no protótipo. As formas das capas são desenhadas localmente e os jogos são fictícios. Os ícones Lucide são conteúdo de terceiros e estão atribuídos abaixo.

Ao redistribuir o código ou os arquivos web compilados, inclua este arquivo e LICENSE junto à distribuição e preserve os avisos incorporados. Se passar a distribuir node_modules, ferramentas, dados ou um instalador, inclua também os textos/NOTICE aplicáveis desses componentes. Refaça a revisão ao mudar dependências ou incluir conteúdo externo.

## Dependências de execução

| Pacote | Versão | Licença declarada |
| --- | --- | --- |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| scheduler | 0.28.0 | MIT |
| lucide-react | 0.468.0 | ISC |

## Ferramentas diretas de desenvolvimento

| Pacote | Versão | Licença declarada |
| --- | --- | --- |
| @eslint/js | 10.0.1 | MIT |
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

## Inventário transitivo do lockfile

Os números contam entradas, incluindo variantes opcionais de plataforma e versões aninhadas; não equivalem ao número de pacotes instalados em cada sistema.

| Licença declarada | Entradas |
| --- | --- |
| Apache-2.0 | 17 |
| BlueOak-1.0.0 | 4 |
| BSD-2-Clause | 8 |
| BSD-3-Clause | 3 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 1 |
| ISC | 13 |
| MIT | 252 |
| MIT-0 | 2 |

- **Apache-2.0:** por exemplo TypeScript e componentes ESLint. Mantenha licença, avisos e NOTICE quando existirem ao redistribuir esses componentes. [Texto Apache](https://www.apache.org/licenses/LICENSE-2.0).
- **BlueOak-1.0.0:** minimatch e versões aninhadas de lru-cache, usados no desenvolvimento. Ao redistribuí-los, preserve o texto ou o [link exigido pela licença Blue Oak](https://blueoakcouncil.org/license/1.0.0).
- **CC-BY-4.0:** dados de caniuse-lite, versão 1.0.30001819, usados pelas ferramentas de compatibilidade. Fonte: [caniuse-lite](https://github.com/browserslist/caniuse-lite), com dados de [Can I use](https://caniuse.com/), sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Não foram modificados nesta revisão; atribuição e indicação de alterações são necessárias ao redistribuir/adaptar esses dados.
- **CC0-1.0:** mdn-data, usado no desenvolvimento, mantém sua [dedicação CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **MIT, MIT-0, ISC e BSD:** preserve os avisos exigidos pelo texto de cada pacote ao redistribuí-lo. MIT-0 não exige atribuição. As licenças permanecem disponíveis nos pacotes instalados.

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
