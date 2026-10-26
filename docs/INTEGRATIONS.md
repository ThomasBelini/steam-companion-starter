# Integrações e riscos

## Steam
Documentação oficial:
- https://steamcommunity.com/dev
- https://partner.steamgames.com/doc/webapi/iplayerservice
- https://partner.steamgames.com/doc/webapi/isteamuserstats
- https://partner.steamgames.com/doc/webapi_overview/auth

Objetivos iniciais: OpenID (identidade), GetOwnedGames (jogos/tempo), GetPlayerAchievements + GetSchemaForGame (conquistas). A configuração de privacidade e disponibilidade dos métodos limitam o que se pode ler; autenticar não concede privilégios extras sobre biblioteca privada.

Verificar: requisito do domínio da Steam Web API Key com subdomínio gratuito, callbacks HTTPS e limites de requisição.

## Promoções
- **Steam:** APIs e/ou parceiros com permissão.
- **Nuuvem:** histórico e preços brasileiros disponíveis por fontes com autorização.
- **Eneba:** marketplace. Verificar custo final com taxas, vendedores, região e plataforma de ativação. Não presumir que um resultado de API de outros comparadores cubra a Eneba. Sem fonte permitida e confiável, exibir link externo sem dados inventados.
- **IsThereAnyDeal:** https://docs.isthereanydeal.com/ — a API proíbe aplicativos concorrentes; nosso módulo agregador de preços pode ser considerado concorrência. **Não utilizar até obter esclarecimento/permissão compatível com o projeto.**

## Guias
- Guardar metadados e links de fontes reconhecidas (com atribuição), não reproduzir textos protegidos integralmente.
- YouTube: usar links e metadados disponíveis por APIs oficiais quando viáveis; data recente é sinal, não garantia de método funcionando.
- Exibir status `verificado`, `não verificado` ou `possivelmente desatualizado`, com regras transparentes.

## Custo zero
- Cloudflare Workers + D1 (planos gratuitos com limites de uso).
- GitHub público + releases (sujeitos às políticas e cotas vigentes).
- Sem LLM embutido no app: assinaturas ChatGPT/Gemini não cobrem automaticamente créditos de API.
