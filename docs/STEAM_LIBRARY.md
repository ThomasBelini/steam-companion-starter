# Preparação da biblioteca Steam

Esta etapa prepara contratos, normalização e um cliente exclusivo do servidor. **Não há login, servidor HTTP, chave configurada, consulta de conta real ou deploy.** A aplicação continua iniciando no modo demo.

## Documentação oficial consultada

- [IPlayerService / GetOwnedGames](https://partner.steamgames.com/doc/webapi/IPlayerService#GetOwnedGames).
- [ISteamUserStats / GetPlayerAchievements e GetSchemaForGame](https://partner.steamgames.com/doc/webapi/ISteamUserStats).
- [Formato de chamadas, interfaces Service e hosts](https://partner.steamgames.com/doc/webapi_overview).
- [Autenticação e tipos de chave](https://partner.steamgames.com/doc/webapi_overview/auth).
- [Termos de uso da Steam Web API](https://steamcommunity.com/dev/apiterms).
- [Registro de chave](https://steamcommunity.com/dev/apikey), acessível somente após login no site oficial. Nenhum login foi realizado nesta revisão.

## Requisitos dos três métodos

Todos os métodos abaixo são de leitura e requerem chave de usuário da Web API, mantida pelo operador no servidor. Não exigem uma publisher key ou uma integração de escrita com Steamworks. O cliente implementado usa GET no host público **HTTPS `api.steampowered.com`**. Os exemplos Steamworks também mostram `partner.steam-api.com`, exclusivo de publishers; ele não deve ser usado com uma chave comum.

| Método | Versão | Parâmetros e observações |
| --- | --- | --- |
| `IPlayerService/GetOwnedGames` | v1 | SteamID64 como string; `include_appinfo: true` para nome; `include_played_free_games: true` inclui jogos gratuitos que o usuário jogou. Não representa todo o catálogo gratuito. Filtro por AppID é suportado pela API, mas não é enviado nesta etapa. Biblioteca depende da visibilidade dos detalhes de jogos. |
| `ISteamUserStats/GetPlayerAchievements` | v1 | SteamID64, AppID e idioma opcional `l`. Obtém progresso por jogo/usuário; não fornece dificuldade ou confiança de guias. Pode falhar por privacidade, ausência de estatísticas ou indisponibilidade. |
| `ISteamUserStats/GetSchemaForGame` | v2 | AppID e idioma opcional `l`; definições de estatísticas/conquistas, sem progresso de um usuário. Versões anteriores não são recomendadas pela Valve. Nem todo jogo retorna schema completo. |

O método Service recebe os argumentos em `input_json`; chave e formato ficam separados. A Valve documenta `x-webapi-key` como alternativa ao parâmetro `key`. O cliente usa esse header para evitar chave em URL. O idioma padrão é `brazilian`, com opção `english`; traduções ausentes usam os textos disponíveis, sem inventar tradução.

## Uso gratuito e open source

Os termos declaram a API gratuita, com limite de **100.000 chamadas por dia**, e permitem seu uso em aplicativos e fornecimento de dados para uso pessoal dos usuários. Não há proibição específica de código aberto nos termos consultados. Isso permite preparar o código MIT sem publicar chave ou relicenciar os dados Steam como MIT. O limite não é uma garantia de disponibilidade ou uma franquia por usuário; a operação deverá controlar seu consumo global e eventuais restrições adicionais.

A chave é confidencial e vinculada à aplicação. Consultas sobre um usuário devem ocorrer a pedido dele. Antes de operar com dados reais, será necessária política de privacidade explicando uso, armazenamento e países onde os dados serão guardados, além dos avisos exigidos pelos termos. OpenID autentica a identidade, não libera dados privados.

A documentação de emissão menciona conta Steam e domínio associado. Sem autenticar no cadastro, não foi comprovada a elegibilidade da conta do operador nem a aceitação de um subdomínio gratuito. **Não foi comprovado custo zero para qualquer conta nova ou configuração de hospedagem.** Se a configuração exigir compra de domínio ou outro gasto, a integração permanece bloqueada até encontrar alternativa permitida sem custo. Nenhuma credencial é necessária para os testes desta etapa.

## Separação implementada

```text
App (React)
  └─ LibraryProvider → LibraryResult
       └─ DemoLibraryProvider (único provedor ativo por padrão)

Futuro servidor autorizado — sem rota pública implementada agora:
  SteamLibraryProvider → SteamApi
    └─ SteamWebApi.server.ts → três endpoints oficiais
         └─ normalizadores de JSON desconhecido → contratos de domínio
```

- [Contratos da biblioteca](../src/library/contracts.ts): resultados discriminados, erros com mensagens fixas, biblioteca incompleta e estados de conquistas.
- [Progresso](../src/library/progress.ts): distingue progresso conhecido, não carregado e jogos sem conquistas.
- [Contratos Steam](../src/steam/contracts.ts) e [normalizadores](../src/steam/normalize.ts): validam os campos usados em tempo de execução. SteamID64 permanece string, sem perda de precisão.
- [Provedor Steam](../src/steam/SteamLibraryProvider.ts): converte jogos ao formato da interface; busca detalhes por chamada explícita a `getGameAchievements`. Não dispara consultas de conquistas para todos os jogos ao listar a biblioteca.
- [Cliente do servidor](../backend/steam/SteamWebApi.server.ts): recebe configuração por injeção; não lê `.env`, não expõe rota, não implementa sessão. Bloqueia execução no navegador; o ESLint também proíbe importação estática de módulos de servidor pela aplicação.

O componente App aceita um `LibraryProvider` para testes. O futuro cliente da API própria deverá implementar esse contrato. O cliente Steam com chave não deve ser passado ao React ou ao desktop. Os testes injetam provedores locais e funções de rede simuladas.

A tela atual não inicia a consulta real de conquistas: o método por jogo está preparado no provedor para futura composição no backend. Itens com conquistas não carregadas aparecem com progresso indisponível, sem exportação de porcentagens inventadas. O modo demo mantém busca, filtros, ordenação, detalhes, desejos e exportação.

## Erros e respostas parciais

- HTTP 401/403: acesso negado/configuração do servidor; não concluir que o perfil é privado.
- HTTP 429: limite atingido; informa `Retry-After` quando ele contém segundos válidos. Não há repetição automática.
- Falha de rede/HTTP não bem-sucedido: indisponibilidade; timeout padrão de oito segundos; cancelamento por AbortSignal.
- JSON inválido, IDs duplicados/inválidos ou identidade divergente no progresso: resposta inválida. Mensagens/corpos/exceções brutas não são repassados à UI.
- `response: {}`: privado ou indisponível, pois não permite determinar a causa. Nunca vira zero jogos.
- Apenas `game_count: 0` com lista ausente/vazia é interpretado como biblioteca explicitamente vazia. Contagem divergente e nomes/tempos ausentes sinalizam incompletude; nome usa AppID e tempo fica desconhecido.
- Lista de conquistas explicitamente vazia no schema permite afirmar ausência de conquistas. Schema incompleto não é essa evidência.
- A junção entre schema e progresso usa o identificador da conquista. Progresso ausente fica `null`, nunca `false`. Falha do progresso mantém as definições com estado indisponível. Conquistas ocultas ainda não desbloqueadas têm título/descrição mascarados.
- A UI diferencia erro, carregamento e lista vazia, ignora respostas antigas de provedores substituídos e não classifica progresso desconhecido como incompleto ou 100%. A exportação rejeita progresso desconhecido.

## O que pode ser testado agora

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run dev
```

Os testes abrangem transporte simulado, versões e parâmetros, confidencialidade da chave, timeout/cancelamento, privacidade ambígua, dados parciais, schema/progresso, spoilers, erros da UI e o fluxo demo existente. Não são prova de respostas ao vivo, emissão de chave, elegibilidade da conta ou disponibilidade futura. Não há novas dependências.

## Necessário antes de consultar uma conta real no aplicativo

1. Comprovar emissão/uso de chave do operador e domínio/hospedagem sem custo, configurando segredo somente no ambiente seguro do servidor — nunca enviar a chave pelo chat, frontend ou repositório.
2. Implementar e revisar o backend HTTPS e a identidade autorizada (futuro OpenID verificado, sessão revogável, antirreplay, autorização por usuário). SteamID recebido em URL/corpo não é autorização. Não expor uma rota arbitrária de consulta de perfis.
3. Definir política de privacidade, pedido explícito do usuário, retenção/exclusão e locais de armazenamento. O usuário deve controlar a visibilidade dos detalhes de jogos na Steam.
4. Adicionar cache por SteamID/AppID/idioma com TTL apropriado, limites globais e por usuário, orçamento diário e controle de concorrência. O cliente atual não implementa cache nem contador diário persistente; não está pronto para tráfego público.
5. Implementar o adaptador frontend da API própria e a ligação do detalhe do jogo com o carregamento sob demanda de conquistas; validar respostas reais com uma conta de teste autorizada, sem copiar credenciais ou payloads privados ao repositório.

Esta preparação não ativa consultas reais, login, rotas públicas ou banco online. A publicação no GitHub permanece manual e separada das verificações e dos commits locais.
