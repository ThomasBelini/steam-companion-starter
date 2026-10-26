# Segurança — requisitos antes de convidar amigos

**ALERTA:** existe backend local com Hono/Workers e D1 emulado, mas o protótipo não contém login ou autenticação operacional. As rotas de auth/dados privados permanecem bloqueadas; não deve ser representado como serviço autenticado. A especificação futura está em [AUTHENTICATION.md](AUTHENTICATION.md) e a execução local em [BACKEND.md](BACKEND.md).

A revisão e as garantias da migração 0005 estão em [D1_INTEGRITY](D1_INTEGRITY.md): uma origem por sessão, proteção contra reativação por UPDATE, preservação de dados legados e limpeza temporal que não exclui sessões válidas. São controles SQL locais; não substituem verificação Steam, autorização ou testes de concorrência HTTP. Login continua bloqueado pelos riscos da [revisão](SECURITY_REVIEW.md).

O [verificador isolado](OPENID_VERIFIER.md) acrescenta validação de asserção e transporte limitado, testados com mocks. Seu resultado não autoriza sessão: descoberta real, nonce/transação D1, browser binding e autorização ainda precisam ser integrados e comprovados. Não existe rota de login ativa.

## Login
- Usar Steam OpenID 2.0 no navegador externo, com página realmente hospedada pela Steam.
- Verificar a resposta OpenID no servidor (Steam `check_authentication`, origem, domínio de retorno, nonce, anti-replay e SteamID64 validado).
- Para desktop, estudar deep link com código aleatório de uso único, vínculo ao navegador/tentativa e prova de posse de segredo nativo; não passar bearer token em URL. OpenID 2.0 não fornece PKCE: o mecanismo do aplicativo exige revisão própria, conforme [AUTHENTICATION](AUTHENTICATION.md).
- Expirar códigos rapidamente e aceitar um único resgate. Vincular resgate à tentativa iniciada no próprio desktop.
- Criar sessão própria com identificador aleatório seguro, curta duração, revogável; guardar somente hash no banco e segredo em armazenamento seguro do SO.
- Nunca pedir senhas/códigos Steam Guard/cookies ou API Key de usuários.

## Servidor
- Nunca expor chaves Steam, preços ou fornecedores secretos no cliente ou GitHub.
- Limitar requisições e acesso por usuário; validar tudo que vem do cliente.
- Toda rota privada verifica sessão e usa a identidade derivada da sessão (não confiar em user_id da URL).
- Respostas de login não vazam em logs; negar redirecionamentos arbitrários; configurar CORS restrito.
- HTTPS; usar secrets do Cloudflare Workers, não variável `VITE_*`.
- Não armazenar game sessions, credenciais de navegador Steam ou inventário.

## Banco
- Todas as operações `wishlist`, `user_goals` e `user_settings` são filtradas por `steam_id` autenticado.
- Queries parametrizadas, limites de tamanho e auditoria mínima para acessos sensíveis.
- Dados pessoais privados por padrão. Exportações de imagens não devem incluir SteamID sem escolha explícita.

## Distribuição
- GitHub secret scanning, Dependabot e revisão de dependências.
- Inspecionar diff e alterações propostas por IA antes de cada commit.
- Produzir SHA256 dos lançamentos. A ausência de certificado de assinatura Windows poderá causar aviso SmartScreen.
- Revisar uma auditoria básica de autenticação/autorização ANTES da primeira release com Steam real.

## Não fazer
- Não implementar login por iframe nem página que imita a Steam.
- Não copiar cookies do cliente Steam ou usar endpoints privados de sessão.
- Não pedir ao usuário que desative Steam Guard.
- Não usar serviços não oficiais que exijam credenciais.
