# Redesenho visual — Fase 2: página individual

Escopo exclusivo: página individual dos jogos e sua integração ao App. A biblioteca, a navegação e a tipografia da [Fase 1](VISUAL_DESIGN.md) foram preservadas. Promoções, desejos e perfil mantêm a apresentação anterior. O protótipo continua demonstrativo, sem autenticação nem consulta externa.

## Referência e recursos

Foi estudada novamente a captura oficial [Library Gamepage](https://raw.githubusercontent.com/SpaceTheme/Steam/main/.github/assets/preview/libGamepage.webp), indicada no [SpaceTheme/Steam](https://github.com/SpaceTheme/Steam). A inspiração está na hierarquia do banner, na faixa horizontal de informações, na navegação secundária e na composição de conteúdo principal com painéis laterais compactos. Não foram reproduzidos controles de jogar/instalar, notícias ou atividade social sem funcionalidade/dados disponíveis.

A implementação usa preto/grafite, bordas finas, raio de 3 px e os tokens Segoe UI Variable/Segoe UI da biblioteca. Bege discreto destaca exportação, progresso e conclusão; não há painéis azuis ou efeitos de vidro. O banner reutiliza as quatro artes SVG originais da Fase 1, também recortadas como capas. Não há novos recursos de terceiros, fontes remotas, dependências, Millennium ou serviços pagos. A imagem de referência não é incorporada ao aplicativo; os avisos/licenças permanecem em [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md).

## Componentes e isolamento

- [GameDetail](../src/game/GameDetail.tsx): banner panorâmico, capa integrada, título, horas, resumo, selo de 100%, âncoras e painéis de progresso/guias.
- [AchievementList](../src/game/AchievementList.tsx): grupos de pendentes, obtidas e status desconhecido, com ícones, descrições e estados vazios. As contagens de grupos representam apenas os registros recebidos.
- [GameExport](../src/game/GameExport.tsx): seletor PNG/JPEG, botão, motivo de indisponibilidade e mensagem sanitizada em falha de Canvas/download. Uma nova tentativa limpa a mensagem.
- [CSS da página](../src/styles/game-detail.css): apresentação e responsividade isoladas; os tokens e o CSS aprovados da biblioteca não foram modificados.
- [App](../src/App.tsx): substitui somente o bloco anterior de detalhes pelo componente. Seleção, busca, filtros, ordenação, favoritos, desejos, consulta por provedor e lógica de progresso permanecem existentes. A escolha do formato de exportação continua no App.

O modelo de dados, [cálculo de progresso](../src/library/progress.ts), dados demo e [exportação Canvas](../src/exportImage.ts) não foram alterados. O cartão exportado conserva a aparência anterior; esta fase redesenha a página do aplicativo. Backend, D1, OpenID, Rust, configuração Tauri, capacidades e CSP permanecem inalterados.

## Dados desconhecidos e conteúdo futuro

- Progresso desconhecido mostra travessão/texto explicativo, sem barra de 0% e sem selo de conclusão. Exportação permanece bloqueada nesse caso.
- `none` distingue um jogo comprovadamente sem conquistas; lista vazia sem esse estado não prova ausência de conquistas.
- Dados privados, ainda não carregados, indisponíveis ou incompletos recebem mensagens próprias. Conquistas com `achieved: null` ficam no grupo de status desconhecido, nunca em pendentes.
- Uma lista parcial com todas as conquistas recebidas obtidas não autoriza declarar 100%.
- Descrição ausente tem alternativa explícita; uma conquista oculta não recebe descrição inventada.
- Outro provedor não herda arte ou gênero demo por coincidência de AppID.
- Guias/recomendações permanecem como seção reservada, sem links, ranking, dificuldade ou tempo estimado inventados. O painel informa que dificuldade é desconhecida e tempo não está disponível; não usa raridade como dificuldade.

As âncoras Informações gerais, Conquistas e Guias mantêm todas as seções disponíveis. São links HTML, acessíveis por Tab/Enter, com destinos focáveis e margem de rolagem para a barra superior. Voltar preserva busca/filtro e encaminha o foco ao título da biblioteca. Cor não é o único indicador: ícones e rótulos identificam os estados. O contorno de foco do título durante a navegação por teclado é intencional e foi preservado.

## Verificações e alcance

| Verificação final | Resultado local |
| --- | --- |
| `npm.cmd run check` | Aprovado: TypeScript, ESLint, migrações locais, testes e builds |
| Testes gerais Vitest | 193 aprovados, incluindo 17 novos casos da página individual |
| Testes backend existentes | 230 aprovados, sem alterar backend |
| Playwright | 30 aprovados: 21 da biblioteca e 9 novos da página individual |
| Total automatizado | **453 testes aprovados** |
| `npm.cmd run desktop:build` | Executável Windows release gerado, sem instalador |
| `git diff --check` | Aprovado |
| WebView2 release | Fluxos demonstrativos e exportações reais aprovados no alcance descrito abaixo |

Os [testes de componente](../tests/game-detail.test.tsx) exercitam estados conhecidos, zero, 100%, ausência de conquistas, dados privados/indisponíveis/incompletos, descrições ausentes, isolamento da arte demo e falha de exportação. Esses estados alternativos usam fixtures locais; não foram consultados perfis Steam reais nem adicionadas situações fictícias à biblioteca demo aprovada.

Os [testes Playwright](../tests/browser/game-detail.spec.ts) executam cliques reais em navegador Edge no Windows. Cobrem retorno à biblioteca preservando busca/filtro, foco, navegação por seções, os quatro jogos, 0/25/50/100%, redimensionamento e download efetivo de PNG/JPEG. Conferem assinatura dos arquivos, extensão e dimensões 1200×630. As capturas são geradas em `test-results/`, ignorado pelo Git. Não se usa `force`, alteração de CSS ou ativação programática para substituir os cliques dos testes.

Na inspeção visual do navegador foram examinadas capturas em 375, 960 e 1440 px. A largura do documento foi medida de 320 a 1920 px sem rolagem horizontal. Essas larguras pequenas são emulação web; o mínimo da janela Tauri continua 960×640.

No **WebView2 real do release Windows**, usando perfil temporário e porta de diagnóstico restrita ao loopback, foram executados cliques de mouse, navegação por teclado, abertura/retorno dos quatro jogos, grupos de conquistas, indicação de conclusão e exportação real de PNG/JPEG em destino isolado, com 1200×630. Foram capturados e examinados Nebula Drift em 1440/375 px e Forestbound concluído; também foi redimensionada a janela nativa para 1100×740 (viewport 1084×701). Não houve exceção JavaScript ou violação CSP no fluxo normal. O processo de teste foi encerrado; nenhuma opção de depuração, perfil, screenshot ou imagem exportada foi adicionada ao aplicativo/repositório.

## Como visualizar no Windows

Na raiz, sem outro Vite ocupando 5173:

```powershell
npm.cmd run desktop:dev
```

Abra um jogo pela capa ou pela barra lateral. Nebula Drift mostra grupos mistos, Forestbound o selo de conclusão e Steel Horizon zero conhecido. Experimente as três âncoras, Tab/Enter, escolha PNG/JPEG e Voltar. O modo demonstrativo e o aviso de ausência de login permanecem visíveis.

Para gerar e abrir o release local, sem instalador:

```powershell
npm.cmd run desktop:build
.\src-tauri\target\release\steam-companion.exe
```

Para repetir a validação:

```powershell
npm.cmd run check
# Somente os testes de navegador da nova página:
npm.cmd run test:browser -- tests/browser/game-detail.spec.ts
```

O `check` também mantém a regressão Playwright da biblioteca e as verificações existentes do backend, sem deploy. Veja [DESKTOP](DESKTOP.md) para pré-requisitos.

A aparência foi aprovada pelo responsável, incluindo banner, capa, conquistas, painéis e tipografia. Permanecem pendentes: leitor de tela real, escalas Windows 125%/150%, contraste alto e matriz ampliada de hardware/WebView2. Destino padrão/cancelamento de downloads e instalação/desinstalação não foram revalidados; os downloads do teste usaram pasta isolada. Os estados privados/incompletos foram comprovados por testes de componente, não por contas reais no navegador/desktop. Guias reais, recomendações, login e integrações externas continuam ausentes. O commit local encerra a Fase 2 após aprovação; não houve push, deploy ou geração de instalador nesta fase.
