# Análise técnica — Steam Companion

Data: 26/10/2026. Foram lidos o README, os cinco documentos originais, todos os arquivos da aplicação, configurações, lockfile e rascunho SQL. Não foram criadas funcionalidades, contas, integrações ou infraestrutura.

## Conclusão

O projeto é um protótipo web executável, com TypeScript estrito e dados explicitamente fictícios. Ainda não é um aplicativo Windows instalável nem um serviço conectado à Steam. A arquitetura documentada é candidata e depende de provas de viabilidade gratuita. O [plano revisado](ROADMAP.md) antecipa sessões e isolamento do banco para antes do primeiro uso autenticado.

## Estrutura e funcionamento

| Arquivo/área | Estado observado |
| --- | --- |
| [README](../README.md) | Instalação, limitações, proposta Tauri e licença ainda não escolhida. |
| [package.json](../package.json) / [lockfile](../package-lock.json) | Aplicação privada ESM 0.1.0; scripts de desenvolvimento, preview, TypeScript e build. Dependências já instaladas. |
| [tsconfig.json](../tsconfig.json) | Modo estrito, checagem de parâmetros/variáveis não usados, `noEmit`; inclui aplicação e configuração Vite. |
| [vite.config.ts](../vite.config.ts) / [index.html](../index.html) | Vite + plugin React, HTML em português; sem configuração desktop/backend. |
| [main.tsx](../src/main.tsx) | Inicialização React com StrictMode. |
| [App.tsx](../src/App.tsx) | Navegação, telas e estado em um componente; importa os dados demo diretamente. |
| [demo.ts](../src/demo.ts) | Quatro jogos, 13 conquistas (seis obtidas), um jogo completo e cinco ofertas de dois títulos. Tudo fictício. |
| [types.ts](../src/types.ts) | Contratos iniciais de jogo, conquista, oferta e provedor. `DemoLibraryProvider` existe, mas a UI não o utiliza. |
| [exportImage.ts](../src/exportImage.ts) | Canvas local 1200 × 630, PNG/JPEG, download por jogo com indicação de demonstração. Sem upload. |
| [styles.css](../src/styles.css) | Interface escura com breakpoints responsivos e fontes locais após a correção. |
| [0001_initial.sql](../backend/migrations/0001_initial.sql) | Rascunho SQLite com usuários, preferências, desejos e metas; chaves estrangeiras, cascata e restrições. Sem conexão à aplicação. |
| [documentação](.) | Requisitos, arquitetura candidata, segurança, integrações e roadmap; não representam recursos implementados. |

A biblioteca implementa busca por título, filtros, ordenação e detalhes de conquistas. Desejos são identificados pelo título e perdidos ao recarregar, conforme declarado no README. Ofertas são fictícias e não abrem lojas. O perfil não autentica nem coleta credenciais. Não existem exportação geral, sincronização, fontes reais de guias/preços, Worker, Hono, D1 conectado ou Tauri.

## Dependências e ambiente

| Dependência | Versão instalada |
| --- | --- |
| React / React DOM | 19.3.1 / 19.3.1 |
| lucide-react | 0.468.0 |
| Vite / plugin React | 6.4.5 / 4.7.0 |
| TypeScript | 5.9.3 |
| Tipos React / React DOM | 19.3.0 / 19.3.0 |
| Tipos Node | 22.20.5 |

Ambiente: Windows, PowerShell, Node 24.22.1 e npm 11.19.1. O projeto não fixa Node em `engines` ou arquivo de versão. Os tipos Node 22 não impediram as verificações no Node 24; convém padronizar uma LTS suportada na futura CI. Não houve atualização de dependências ou reinstalação limpa.

Git, Rust e Cargo não foram encontrados no PATH. A pasta não apresentou diretório `.git`; histórico, remotos, branch e diff Git não puderam ser consultados. Isso não impede o build web. Os demais pré-requisitos nativos do Tauri não foram validados.

## Verificações executadas

| Verificação | Resultado e alcance |
| --- | --- |
| `npm.cmd ls --depth=0` | Passou, sem dependências diretas ausentes ou incompatíveis reportadas. |
| `npm.cmd run typecheck` | Passou; não substitui lint ou testes de comportamento. |
| `npm.cmd run build` | Passou, gerando arquivos web estáticos; não um instalador Windows. |
| `npm.cmd audit --json` | Zero vulnerabilidades conhecidas reportadas; não garante ausência de falhas ou suporte futuro das versões. |
| `npm.cmd run dev -- --host 127.0.0.1` | Servidor iniciado e tela inicial carregada no navegador integrado com os quatro jogos e totais esperados. |
| SQL em SQLite local em memória, via `node:sqlite` | Passou: criação/reaplicação, quatro tabelas, privacidade padrão, chaves estrangeiras, unicidade, restrições de estado/visibilidade, cascata e integridade. Excluir um usuário preservou os desejos do outro. |
| Inspeção de código próprio e configurações | Nenhuma credencial real, cliente Steam ou chamada `fetch` encontrada; havia fonte remota do Google, removida. Não é uma auditoria do histórico Git. |

Não há scripts/configuração de lint, testes automatizados, cobertura ou CI; esses controles não foram reportados como aprovados. O navegador integrado perdeu a referência da página ao tentar automatizar interações. Apenas o carregamento inicial foi confirmado: busca, filtros, desejos e exportação foram inspecionados no código, mas ainda precisam de teste completo de interação e dos arquivos reais PNG/JPEG. A gravação no WebView2/Tauri também permanece pendente.

O teste SQL não comprova operação no D1, migração remota ou autorização de uma API. Não houve banco persistente, login Steam ou API paga. Não foi feita avaliação visual completa de acessibilidade/responsividade.

## Correções realizadas

1. Removida a importação Google Fonts de [styles.css](../src/styles.css), evitando conexão externa desnecessária e usando a cadeia de fontes locais existente. A tipografia pode variar conforme as fontes instaladas.
2. [gitignore](../.gitignore) agora cobre `.env.*`, preservando o exemplo público. Variantes como `.env.production` e `.env.staging` antes não estavam cobertas. A regra não remove arquivos já rastreados nem substitui revisão de segredos.
3. Acrescentada exclusão de `*.tsbuildinfo`, artefato gerado por `tsc -b`, para evitar inclusão acidental no versionamento.

TypeScript e build já passavam; não precisaram de correção funcional. Nenhuma dependência nova foi adicionada.

## Lacunas e recomendações

### Segurança: bloqueia uso real

- A especificação de segurança é uma boa base, mas não há implementação/testes de autenticação, autorização, expiração, revogação e limites.
- OpenID autentica identidade e não concede leitura de biblioteca privada. Não confundir Steam OpenID com OAuth nem atribuir PKCE ao provedor; uma prova de posse própria pode proteger o resgate desktop.
- Verificar endpoint oficial fixo, assinatura/campos assinados, identidade Steam, retorno, realm, nonce e antirreplay. Nunca consultar endpoint arbitrário recebido do cliente.
- Código de retorno curto, de uso único e vinculado à tentativa e a um segredo gerado pelo desktop; `state` numa URL interceptável não basta. Consumo de código/nonce deve ser atômico, inclusive sob concorrência.
- Segredo do operador somente no backend; token desktop no armazenamento seguro do Windows. Não pedir chave Steam aos usuários finais. CORS não substitui autenticação.
- Cada consulta privada deve usar o SteamID da sessão, SQL parametrizado e limites de tamanho. Chaves estrangeiras não isolam usuários por si mesmas.
- Antes do beta: retenção/exclusão de dados, limpeza de cache no logout, logs sem dados sensíveis e revisão de segurança. No Tauri: CSP, IPC e capacidades mínimas, validação de links externos e nenhum conteúdo remoto com acesso irrestrito aos comandos nativos.

### Arquitetura e dados

- Separar apresentação, domínio, casos de uso, provedores e persistência gradualmente. Não acrescentar SDKs externos diretamente ao componente principal; um backend modular basta inicialmente.
- `getGames(): Promise<Game[]>` não distingue vazio, privado, erro, cota excedida e cache antigo. Definir estados explícitos antes de conectar Steam.
- `achievements: []` mistura jogo sem conquistas e dados ausentes; hoje vira 0% e entra no filtro incompletos. O demo não cobre esse caso.
- Separar definições de conquistas do progresso por usuário; incluir idioma, data de desbloqueio, ocultação/spoilers e proveniência. Dificuldade/tempo não podem ser inferidos da raridade.
- Desejos por título colidem entre jogos/edições. Ofertas precisam de AppID/edição, moeda, data da coleta, região, plataforma de ativação, vendedor e estado das taxas.
- Os indicadores de verificação da oferta não controlam a UI atual, que sempre mostra aviso demo. Antes de dados reais, exibir os estados reais de cada campo.
- SQL ainda não modela sessões, tentativas/nonce ou guias, nem valida JSON, tamanho dos dados e AppID positivo. Criar migrações formais quando os contratos forem aprovados.
- Documentação e SQL divergem em `joined_at`/`created_at` e `wishlist`/`user_wishlist`. Alinhar na formalização; o SQL atual permanece rascunho.

### Qualidade, distribuição e licença

- Faltam estados de carregamento/erro e tratamento de falha Canvas/download. Rever semântica das barras de progresso, teclado/leitores de tela e interface estreita.
- Validar exportação no desktop antes de escolher a permissão mínima de gravação. Capas remotas exigirão licença/CORS; o desenho atual é inteiramente local.
- Falta licença própria: intenção open source não concede automaticamente permissão de reutilização. Escolher licença e revisar atribuições antes de publicar.
- Definir build Windows reproduzível, política de atualização e integridade/autenticidade dos artefatos. Hash publicado junto ao instalador não substitui assinatura.
- Certificado comercial não pode ser obrigatório para custo zero; documentar possível SmartScreen em binários sem assinatura.

### Integrações e custo

- Workers/Hono/D1 são candidatos. Validar callback/realm em domínio gratuito, elegibilidade de chave do operador, termos, cotas e prevenção de abuso.
- Não prometer escala ilimitada. Usar exclusivamente planos gratuitos sem cobrança automática; ao atingir limites, suspender sincronização ou degradar recursos, nunca contratar upgrade automaticamente.
- Não há fonte gratuita/autorizada comprovada no projeto para as três lojas com histórico, preço final e ativação BR/Steam. Eneba exige cuidado adicional com vendedor e taxas.
- A documentação alerta sobre restrição concorrencial do IsThereAnyDeal. Seu uso continua bloqueado até confirmar termos/permissão. Não presumir cobertura Eneba ou autorização para scraping.
- Sem fonte válida, futuros links oficiais com indicação de indisponibilidade são uma entrega parcial explícita, não uma comparação automatizada completa.
- Histórico deve declarar fonte e cobertura; coleta própria autorizada só produz histórico desde o início das observações, sem inventar dados retroativos.

Políticas e cotas externas não foram revalidadas nesta sessão. Confirmá-las na etapa de viabilidade, usando as referências de [INTEGRATIONS](INTEGRATIONS.md), antes de assumir compromissos de produto.
