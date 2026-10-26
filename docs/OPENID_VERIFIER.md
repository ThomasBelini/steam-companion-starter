# Verificador Steam OpenID 2.0 isolado

O [SteamOpenIdVerifier](../backend/steam/SteamOpenIdVerifier.server.ts) verifica uma asserção dentro de um perfil Steam restrito. **Não está ligado ao Worker HTTP, não inicia login, não emite sessão/token/grant e não consome nonces no D1.** O frontend e as rotas atuais permanecem inalterados. Nenhuma autenticação Steam real foi efetuada.

## Fontes oficiais e decisões

Foram consultadas a [especificação OpenID Authentication 2.0](https://openid.net/specs/openid-authentication-2_0.html), especialmente §§4.1, 5.1, 10.1 e 11, a [Steam Community](https://steamcommunity.com/dev#steam_openid) e a [Steamworks](https://partner.steamgames.com/doc/features/auth#website).

O protocolo exige conferência de retorno, descoberta, nonce e assinatura. A lista assinada deve cobrir os campos obrigatórios; não exige que `signed` assine a si próprio. Verificação direta é um POST com os valores OpenID recebidos, mudando apenas mode, e resposta Key-Value. `is_valid:true` isolado não substitui as demais verificações.

A documentação Valve diverge entre identificadores HTTP e HTTPS. O perfil aceita sintaticamente ambos, mas exige igualdade exata entre identity/claimed_id e a tupla de descoberta, sem converter esquema, domínio ou caminho. Isso não comprova que ambas as formas funcionam hoje na Steam. A comparação com mocks não substitui uma prova futura autorizada de compatibilidade.

Foi lido somente o [documento público de descoberta do provedor](https://steamcommunity.com/openid/), sem conta ou autenticação; ele anuncia `https://steamcommunity.com/openid/login`. Esse é o único destino permitido ao transporte check_authentication. Essa leitura de metadados não substitui a descoberta do identificador do usuário exigida pelo protocolo.

## Contratos e dependências

Os [contratos](../backend/steam/OpenIdContracts.ts) separam callback, descoberta, transporte e consulta de replay. Não há dependências novas de npm.

O construtor exige explicitamente:

- `fetcher`: transporte Fetch do servidor. Os testes usam mocks; não existe fallback para fetch global. Deve respeitar endpoint, sinal de cancelamento e bloqueio de redirects.
- `discoverIdentity`: consulta confiável que devolve claimedId, identity, namespace e opEndpoint descobertos, ou NULL. O verificador compara cada campo. **O resolvedor real de descoberta ainda não foi implementado**, e não há resolvedor que simplesmente confia no callback por padrão. Ele deverá restringir hosts/redirects/tamanhos, usar transporte seguro e tratar parser/discovery adequadamente antes de uso conectado.
- `lookupNonce`: consulta somente leitura que retorna exatamente `seen` ou `unseen`; resposta desconhecida, exceção ou timeout falha. O [adaptador D1 preparatório](OPENID_D1_PREPARATION.md) fornece essa consulta e coordena gravação posterior, sem ligar rotas HTTP.
- Opcionalmente `now`, relógio em milissegundos Unix do servidor, e timeout total inteiro entre 1 e 8.000 ms. Os testes usam relógio fixo; não aceitar horário do cliente como referência.

Essas dependências são código confiável do backend. Não aceitar que cliente HTTP/React escolha implementações, booleanos de descoberta/verificação ou resultados serializados de sucesso. Um mock desonesto não prova autenticidade criptográfica; em produção a verificação direta deve vir da Steam pelo transporte confiável.

## Validação implementada

O [validador](../backend/steam/OpenIdValidation.server.ts) recebe método **GET**, URL completa do callback e expectedReturnTo/realm do contexto confiável da tentativa. POST é recusado; não há mescla de parâmetros de query/corpo. Um futuro adaptador HTTP deve preservar essa restrição ou revisar/testar suporte POST separado.

1. URLs do backend devem ser HTTPS canônicas, sem userinfo, fragmento, porta explícita ou barras invertidas. Nesta etapa realm é a origem HTTPS com caminho raiz, sem wildcard/query. Host/caminho efetivos precisam corresponder ao retorno esperado. A futura origem pública configurada não pode ser reconstruída de headers de proxy/Host não confiáveis.
2. O retorno assinado deve ser exatamente o expectedReturnTo registrado, incluindo correlação. Seus parâmetros também precisam estar presentes no callback com os mesmos valores. Parâmetros externos a OpenID só são aceitos se previstos no retorno; o contexto não pode conter chaves `openid.*`.
3. A query tem até 16 KiB, 32 campos, nomes ASCII de até 128 caracteres e valores de até 4 KiB em UTF-8. Decodificação ocorre uma única vez; duplicatas após decodificação, escapes malformados, UTF-8 inválido e caracteres de controle falham. As URLs também têm limite de comprimento antes do parsing.
4. Namespace 2.0, modo id_res, endpoint HTTPS fixo, identidade Steam canônica e todos os campos obrigatórios são conferidos antes das dependências de rede. SteamID usa o contrato decimal uint64 do projeto, sem prefixo numérico especial; formato sintático não comprova uma conta real.
5. `signed` deve listar op_endpoint, return_to, response_nonce, assoc_handle, claimed_id e identity, sem nomes repetidos/vazios e sem referenciar campo inexistente. `signed` não precisa constar da lista. Namespace e modo são validados por valor, sem exigir que estejam na lista assinada. A assinatura deve ter Base64 canônico compatível com os tamanhos MAC do protocolo; a confirmação da assinatura é delegada ao provedor, não calculada localmente.
6. A descoberta precisa retornar exatamente a identidade e o endpoint validados. Falha ou divergência nega a asserção antes do POST. O suporte a HTTP no identificador não autoriza transporte de verificação em HTTP nem descoberta em texto puro.

Esses limites e restrições de URL constituem o perfil conservador escolhido, não suporte genérico a todos os provedores OpenID. Antes de conectar a Steam real, medir compatibilidade sem ampliar regras automaticamente diante de respostas inesperadas.

## Transporte check_authentication

Somente `https://steamcommunity.com/openid/login`, POST form, redirect `error`, cache `no-store`, sem cookies ou credenciais Steam do usuário. O módulo copia os valores lógicos de todos os campos `openid.*`, inclusive extras, e altera somente `openid.mode`. A codificação form pode representar caracteres de outra forma equivalente no fio; o conteúdo dos valores não é normalizado. State e demais parâmetros do aplicativo não são enviados ao provedor.

O prazo total padrão de 8 s cobre consulta de replay, descoberta, transporte e leitura do corpo. AbortSignal e uma corrida de prazo evitam esperar indefinidamente mesmo se um mock ignorar cancelamento. Uma dependência que ignora o sinal pode continuar sua própria operação interna, mas não autoriza sessão nem dispara etapas posteriores depois de detectado o cancelamento.

A resposta deve ser HTTP 200, sem redirect seguido ou URL final divergente. Content-Type pode estar ausente conforme o protocolo; se presente, o perfil exige text/plain com charset UTF-8 opcional. JSON/HTML e outros charsets são recusados.

O corpo é lido por stream com limite de 16 KiB real, UTF-8 estrito e cancelamento ao falhar. Content-Length inválido, excessivo ou incompatível com os bytes entregues é recusado; um adaptador futuro que descomprima o transporte deverá entregar metadados coerentes. Compressão e comportamento real Workers/Steam ainda precisam de prova de compatibilidade; nenhum corpo pessoal foi capturado nesta etapa.

O parser aceita somente ns, is_valid e invalidate_handle opcional, com nomes únicos, linhas terminadas por LF e valores exatos. CRLF, linhas extras, BOM, espaços em booleanos, truncamento, namespace incorreto, erro junto a sucesso ou resultado desconhecido falham. Não existe fallback permissivo para respostas malformadas. Falhas retornam códigos internos sem eco de callback, corpo ou exceção e sem logs.

## Nonce e limite da garantia de replay

O nonce tem até 255 caracteres, timestamp UTC sem fração e sufixo ASCII imprimível opcional. Datas inexistentes e offsets são recusados. Política local: idade **menor que 5 minutos**, tolerância futura de até 60 s, com nova conferência após terminar a verificação remota.

O módulo deriva SHA-256 de endpoint + separador + nonce, consulta a existência e prepara retenção de dez minutos após a verificação. O valor bruto não é devolvido no resultado. Não registra nem consome o nonce: evitar uma escrita antecipada sem coordenação com tentativa/grant.

Um resultado positivo tem o estágio literal `assertion-verified-pending-atomic-commit` e apenas dados de asserção. **Não significa usuário autenticado, sessão válida ou permissão de acesso.** Duas chamadas concorrentes ainda podem observar `unseen` e terminar nesse estágio; há um teste explícito dessa limitação.

A futura integração D1 deverá conferir novamente frescor e tentativa/browser binding, inserir nonce inédito e efetuar o consumo/criação correspondentes em uma transação que falhe integralmente se outra chamada vencer. Só depois será possível avançar no fluxo. TTL e limpeza não podem liberar um nonce ainda aceitável. A política não permite tratar falha do banco como `unseen`.

Na etapa isolada original não havia adapter de banco, nova migração ou escrita SQL. A preparação posterior está em [OPENID_D1_PREPARATION](OPENID_D1_PREPARATION.md): o verificador permanece inalterado e independente, mas um módulo externo agora registra asserção/nonce em D1 e prepara a rejeição de legado/proveniência ausente. Nenhuma rota o chama. Revisão das transições até emissão e testes de concorrência entre requisições reais continuam obrigatórios.

## Testes e verificação

Os [testes](../backend/tests/steam-openid.test.ts) usam somente relógio, descoberta, nonces e Fetch simulados. Fetch global é bloqueado e conferido em cada caso. Não há envio de check_authentication real.

Cobertura: asserções válidas HTTP/HTTPS simuladas; valores encaminhados sem normalização; lista assinada usual sem autorreferência; remoção individual de cada campo obrigatório e assinado; adulteração de identidade; retorno/realm incorretos; hosts falsificados; duplicatas inclusive codificadas; limites/UTF-8; nonce antigo/futuro/replay; descoberta ausente/divergente; erros HTTP, rede, stream, resposta truncada/malformada; timeout de todas as dependências; ausência de emissão de sessão/token. `is_valid:true` simulado não supera a validação local de campos assinados.

```powershell
npm.cmd run test:backend -- backend/tests/steam-openid.test.ts
npm.cmd run check
```

O segundo comando também executa migrações D1 **locais**, testes anteriores, tipos, lint e builds; build Worker usa somente dry-run. A suíte não comprova validade criptográfica de uma asserção Steam real, descoberta real, comportamento Windows, transporte público ou atomicidade distribuída.

Resultado desta etapa: `npm.cmd run check` aprovado, com **384 testes** (154 gerais e 230 de backend, dos quais 126 do verificador). TypeScript, ESLint, migrações locais sem pendências e ambos os builds passaram. Nenhuma migração, rota HTTP, dependência ou arquivo do frontend foi alterado.

## Bloqueadores que permanecem

R01 continua aberto: vínculo navegador/dispositivo contra relay/login CSRF. R02 recebeu parser, transporte e conferência de descoberta, mas ainda depende de resolvedor real seguro, compatibilidade com Steam/Workers e revisão dos vetores. R03 recebeu depois a [gravação atômica preparatória](OPENID_D1_PREPARATION.md) de asserção/nonce, mas continua pendente até grant/sessão e no ambiente distribuído. Também faltam armazenamento/IPC Tauri, autorização por usuário, CSRF operacional, revogação HTTP, privacidade/retenção, limites e comprovação da operação gratuita.

Os [gates de segurança](SECURITY_REVIEW.md) não foram aprovados por estes testes. Rotas de autenticação e dados permanecem bloqueadas, e a ativação futura exige autorização e provas separadas. Esta etapa não realiza deploy, cria recursos remotos, faz commit ou push.
