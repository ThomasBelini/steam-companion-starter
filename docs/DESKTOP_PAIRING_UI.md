# Pareamento demonstrativo na janela Windows

Somente **Piloto Demo (identidade fictícia)**. Não existe login Steam, SteamID, sessão, token, acesso privado ou chamada ao Worker/OpenID/D1. A biblioteca e os preços continuam fictícios. Esta configuração não autoriza o primeiro login real.

## Executar

Com os pré-requisitos de [DESKTOP](DESKTOP.md), Node 24 e dependências do lockfile, na raiz:

```powershell
npm.cmd ci
npm.cmd run desktop:demo
```

Não execute outro Vite na porta 5173. Em **Meu perfil**:

1. Clique **Iniciar demonstração**. Rust reserva dois listeners efêmeros somente em 127.0.0.1 e abre a URL gerada no navegador padrão do Windows.
2. No navegador, leia o aviso e clique **Confirmar demonstração fictícia**. Cookie, Origin, CSRF e tentativa são verificados antes de solicitar aprovação nativa.
3. Volte ao aplicativo e clique **Confirmar identidade fictícia neste aplicativo**, somente se você iniciou essa confirmação. A identidade é fixa; nunca vem de parâmetros do navegador.
4. No navegador, clique **Gerar retorno simulado** e **Concluir no aplicativo de laboratório**. Esse segundo botão já pertence ao protocolo do console e foi preservado.
5. O aplicativo mostra sucesso explicitamente fictício. Os dois listeners encerram e o material nativo é descartado. O estado só vive em memória; nenhuma conta Steam passa a estar conectada.

**Cancelar demonstração** encerra os listeners. A tentativa dura até 120 s e o código até 60 s, limitado à tentativa. Fechar a janela também cancela. Navegar para outra página do app não cancela; retornar ao perfil recupera o estado público da tentativa nativa. Fechar a aba externa não confirma nem cancela automaticamente; use cancelar ou espere a expiração. Em caso de falha ao abrir o navegador, cancele e tente novamente.

`desktop:dev`, `desktop:build` e `desktop:bundle` não incluem essa ponte. Web e desktop normal mostram a área indisponível, sem invocar comandos nativos. Não há variável de ambiente, credencial ou modo fake do Worker a configurar.

## Limites de compilação e permissões

- Feature `desktop-pairing-demo`, sem features default, reutiliza `pairing-prototype`. `compile_error!` proíbe a ponte em release ou fora de Windows. Não use `--release` com essa feature. O build normal não importa protocolo/criptografia/bridge nem registra os quatro handlers.
- O build script também rejeita `PROFILE` diferente de `debug`, inclusive um release que tente habilitar debug assertions. Não há fallback de produção.
- [Configuração opt-in](../src-tauri/tauri.pairing-demo.conf.json) preserva a CSP de produção e adiciona ao `devCsp` apenas `ipc:` e `http://ipc.localhost`. Nenhum acesso HTTP do React aos listeners. A [configuração normal](../src-tauri/tauri.conf.json) e a [capability normal](../src-tauri/capabilities/main-demo.json) permanecem intactas.
- `AppManifest::commands` incorpora os quatro comandos à ACL, pois comandos de aplicação Tauri seriam permitidos por padrão sem esse manifesto. As permissões geradas são ignoradas pelo Git e regeneradas no build. A configuração opt-in concede somente start/status/approve/cancel à janela local `main`, sem origens remotas. O próprio comando confere janela e origem Vite exata.
- Comandos não aceitam URL, código, identidade, arquivo, comando shell ou outros argumentos de protocolo. Retornam somente strings de uma lista fechada: idle/waiting/confirmation_required/return_pending/completed/cancelled/expired/error. Erros são constantes; o frontend descarta qualquer payload fora do contrato.
- Marcador público de disponibilidade é injetado apenas na configuração Rust com feature. Não é um controle de autorização: os controles são compilação, ausência de handlers, ACL e validação nativa. Alterar o JavaScript não habilita o protocolo no binário normal.
- A única dependência npm nova é `@tauri-apps/api` 2.12.4, SDK oficial, sem plugin ou dependências transitivas próprias, para `invoke`/`isTauri`. Aviso MIT em [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md). Não há nova crate ou mudança de Cargo.lock.
- Abertura externa usa `ShellExecuteW` com verbo fixo `open`, sem parâmetros, shell de comandos ou elevação, apenas para a URL de início gerada em Rust e validada estruturalmente. Não existe comando opener genérico acessível ao React.

## Reuso e segurança

[Protocolo compartilhado](../src-tauri/prototype/pairing.rs), [HTTP](../src-tauri/prototype/http.rs) e [criptografia](../src-tauri/prototype/crypto.rs) são reutilizados por caminho de módulo, sem cópia. O console mantém a confirmação manual original. No modo desktop, a confirmação aleatória permanece no Rust: o POST validado do navegador marca intenção, o comando nativo aprova, e um novo POST no mesmo vínculo emite o código. A mesma validação central de cookie/CSRF, código único e S256 continua aplicável. Nem confirmação, verifier, cookie, CSRF, URL, state ou código atravessam IPC. Não há código de confirmação oculto embutido no HTML desktop.

O [controlador nativo](../src-tauri/src/pairing_demo.rs) permite uma tentativa por processo. Mutex serializa início, aprovação, cancelamento e consumo. Um retorno que já venceu não é reclassificado como cancelado. Cada instância independente mantém seu estado e portas; código cruzado continua inválido. Uma thread nativa observa o ciclo de vida e descarta os listeners mesmo sem polling React. O polling de 400 ms é somente IPC de estados, sem resgate de código ou HTTP; desmontar a tela cancela seu polling. Nenhuma tentativa ou segredo é persistido em armazenamento web ou logs.

O parser HTTP permanece **experimental**, restrito à demonstração. Host/Origin exatos, framing, tamanhos, deadlines, Fetch Metadata, cookie e CSRF não foram relaxados. Não usar esse servidor em produção. O verificador OpenID e o backend permanecem completamente separados.

## Verificações

```powershell
npm.cmd run check
npm.cmd run desktop:check
npm.cmd run desktop:demo:test
npm.cmd run desktop:pairing:test
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --features desktop-pairing-demo -- -D warnings
npm.cmd run desktop:build
git diff --check
```

Resultados desta etapa: `check` aprovou **227 gerais + 274 backend + 43 Playwright = 544 testes**, TypeScript, ESLint, migrações 0001–0006 e builds web/Worker dry-run. Foi usada cópia temporária dos candidatos com D1 novo, preservando o estado D1 do projeto. `desktop:check`: **3 testes Rust**; `desktop:demo:test`: **42 testes Rust (3 app + 30 compartilhados + 9 novos)**; laboratório: **30 testes + 5 cenários Edge/processos**; Clippy sem avisos; build Windows normal aprovado. Uma execução real de `cargo check --release --features desktop-pairing-demo --locked` foi rejeitada pela proteção de compilação esperada.

Os testes novos exercitam ida/volta com sockets reais, ordem navegador/aprovação, retorno inválido, cancelamento, expiração sem polling, oito inícios concorrentes com um vencedor, replay, origem forjada, erro de abertura, encerramento e destino arbitrário rejeitado. A suíte compartilhada cobre prova incorreta, códigos expirados, retornos TCP simultâneos e reuso. No frontend, há testes de teclado/estados/concorrência/contrato sem segredos e indisponibilidade web; um teste Playwright usa IPC **simulado**, não Rust. Os outros Playwright mantêm busca, filtros, desejos, navegação, PNG/JPEG e responsividade existentes.

A CI mantém matriz, permissões, cache e todos os passos anteriores; Windows também executa `desktop:demo:test` e Clippy com a nova feature. Não abre navegador por esse comando Cargo. Os cinco cenários externos, o build release e a conferência WebView2 continuam locais. A alteração nova da CI ainda precisa de execução remota autorizada.

### Janela WebView2 real e confirmação manual no Windows

Na conferência automatizada inicial, foi aberta uma janela real por `desktop:demo`. O perfil renderizou, o início acionou Rust e chegou a **aguardando confirmação**, e o cancelamento pela interface chegou a **cancelada**. Capturas locais da área nova foram inspecionadas. O sistema aceitou a chamada de abertura pelo navegador padrão, mas a ferramenta não conseguiu controlar essa janela externa. Essa execução automatizada, isoladamente, não comprovou a ida e volta completa.

**Posteriormente, o responsável confirmou manualmente o fluxo completo no Windows e concedeu aprovação visual e funcional**, relatando:

1. Início da demonstração em Meu perfil.
2. Abertura correta do navegador externo.
3. Confirmação fictícia no navegador.
4. Confirmação da identidade no Steam Companion.
5. Geração do retorno simulado no navegador.
6. Conclusão no aplicativo com **Piloto Demo — identidade fictícia**.
7. Mensagem **Pareamento simulado concluído** no navegador.

Assim, a ida e volta **Tauri → navegador padrão → Tauri** foi comprovada pelo teste manual informado pelo usuário. Essa evidência confirma o funcionamento demonstrativo nessa máquina; **não valida segurança em produção**, relay entre dispositivos, isolamento de cookies locais, autenticação HTTPS distribuída, OpenID real ou emissão de sessões. Não confundir esse ensaio com os cinco cenários Edge headless do console ou com os testes TCP.

Na inspeção, um handler por janela que capturava `AppHandle` manteve a janela aberta após a solicitação de fechamento. Ele foi substituído pelo handler do builder sem captura de handle. Após a correção, duas execuções reais encerraram com código 0 por solicitação nativa de fechamento: uma sem tentativa e outra com tentativa aguardando o navegador. Há também teste Rust de descarte de estado encerrando as duas portas sem cleanup do React. Isso valida somente os casos executados.

Para repetir a conferência, execute os cinco passos acima no Windows, usando seu navegador padrão: confira a confirmação local solicitada após o primeiro clique externo, sucesso fictício após os dois cliques finais, cancelar antes/depois de confirmar, expirar após 120 s, reiniciar e fechar a janela com uma tentativa pendente. Use Tab/Enter/Espaço e reduza a janela até 960×640. O teclado e a responsividade foram exercitados por testes automatizados web. O relato do usuário confirma a sequência de sucesso descrita acima; não acrescenta comprovação manual de todos os casos negativos, leitores de tela ou outros navegadores padrão.

O diagnóstico WebView2 usou perfil temporário e porta de depuração somente na execução de teste, sem alterar configurações persistentes do Windows ou do projeto. Não use essas opções para distribuir o app. Um cache Vite compartilhado pela cópia de testes causou inicialmente módulos React divergentes; reiniciar apenas o servidor de teste com reotimização resolveu o ambiente. Não foi necessário relaxar CSP, ACL ou mudar React. Nas verificações seguintes, a cópia temporária usa cache Vite separado.

O executável **release normal também foi aberto no WebView2 real**: marcador de disponibilidade ausente, botão demonstrativo desabilitado e invocação direta de `pairing_demo_start` rejeitada. A janela release encerrou por solicitação nativa. Isso comprova o bloqueio observado nessa compilação, além do teste de rejeição da feature em release; não é uma prova do fluxo autenticado.

## Bloqueadores para autenticação real

R01/R02/R03 da [revisão](SECURITY_REVIEW.md) continuam abertos. Confirmar uma identidade fixa fictícia não comprova vínculo com uma conta real ou proteção contra engenharia social/relay entre computadores. Cookies locais continuam compartilhados entre portas; o primeiro navegador incorreto pode bloquear o legítimo e um processo local malicioso pode interferir no HTTP. Prova S256 não atesta a legitimidade do executável. Não há mitigação contra debugger/malware/dumps de memória.

Faltam backend HTTPS gratuito elegível, descoberta e observação OpenID revisadas, intenção/conta/destino real, consumo D1 completo com grant/sessão e falhas/retries, isolamento HTTP, armazenamento Windows seguro, logout/revogação, retenção/cotas e revisão adversarial do fluxo completo em dois computadores. Próxima etapa recomendada: avaliar adversarialmente esta UX demonstrativa e o protocolo de intenção/conta/destino antes de desenhar sua versão autenticada. Nenhum gate de login real é aprovado pelo número de testes.

Fontes oficiais: [ACL de comandos Tauri](https://v2.tauri.app/security/capabilities/), [CSP Tauri](https://v2.tauri.app/security/csp/), [ShellExecuteW](https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shellexecutew). Permissões são explicitamente restritas conforme o modelo oficial; nenhuma delas autoriza chamadas Steam ou dados privados.

## Arquivos desta etapa

| Área | Arquivos novos ou modificados |
| --- | --- |
| Interface | [App](../src/App.tsx), [PairingDemo](../src/desktop/PairingDemo.tsx), [contrato IPC](../src/desktop/pairing.ts), [estilos locais](../src/desktop/pairing.css) |
| Nativo | [entrada](../src-tauri/src/main.rs), [controlador](../src-tauri/src/pairing_demo.rs), [testes do controlador](../src-tauri/src/pairing_demo/tests.rs), [protocolo compartilhado](../src-tauri/prototype/pairing.rs), [fixture do console](../src-tauri/prototype/tests.rs), [manifesto](../src-tauri/Cargo.toml), [build/ACL](../src-tauri/build.rs) |
| Configuração e CI | [config opt-in](../src-tauri/tauri.pairing-demo.conf.json), [workflow](../.github/workflows/ci.yml), [gitignore](../.gitignore) |
| Dependência e scripts | [package.json](../package.json), [package-lock.json](../package-lock.json) |
| Testes web | [contrato e componente](../tests/pairing.test.tsx), [isolamento desktop](../tests/desktop-security.test.ts), [Playwright](../tests/browser/pairing.spec.ts) |
| Documentação | [README](../README.md), [avisos de terceiros](../THIRD_PARTY_NOTICES.md), [autenticação](AUTHENTICATION.md), [desktop](DESKTOP.md), [laboratório](DESKTOP_PAIRING.md), [segurança](SECURITY.md), [revisão](SECURITY_REVIEW.md), [este relatório](DESKTOP_PAIRING_UI.md) |

Nenhuma alteração em backend, OpenID, migrações D1, biblioteca, jogos, promoções, desejos, tokens de estilo, Cargo.lock, configuração/capability normal ou política de navegação/downloads. Nenhuma credencial ou arquivo privado foi identificado na revisão dos 132 arquivos candidatos. `actionlint` e `git diff --check` aprovados. O usuário concedeu aprovação visual/funcional e autorizou o commit local após as verificações finais. Não houve push, deploy ou recurso remoto; a aprovação não autoriza login Steam real ou sessões verdadeiras.
