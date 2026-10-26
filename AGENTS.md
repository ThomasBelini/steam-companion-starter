# Steam Companion — regras do projeto

- Leia [README](README.md), [AUDIT](docs/AUDIT.md), [ROADMAP](docs/ROADMAP.md) e [SECURITY](docs/SECURITY.md) antes de alterar o escopo.
- O projeto é um protótipo React + TypeScript com dados fictícios. Preserve os avisos de demonstração; não apresente login, preços, guias ou biblioteca como reais.
- Custo adicional zero: nenhuma API paga, cobrança automática ou serviço pago obrigatório. Não publique, faça deploy ou envie código ao GitHub sem pedido explícito.
- Nunca solicite ou inclua senhas, Steam Guard, cookies, chaves Steam, tokens ou dados privados. Somente valores públicos podem usar `VITE_*`; o demo não precisa de `.env`.
- Login futuro: Steam OpenID no navegador externo, verificado no servidor, com sessões revogáveis e isolamento por usuário. Tauri, Worker/Hono e D1 são propostas futuras, não integrações existentes.
- Mantenha TypeScript estrito, dependências mínimas e lockfile atualizado. Separe regras e provedores da apresentação quando necessário; evite refatorações fora do escopo.
- Testes devem exercitar comportamentos existentes com dados locais, sem rede ou credenciais. Não use raridade como dificuldade nem invente fonte, preço ou histórico.
- Use Node 24 (mínimo 24.15) e `npm ci`. No PowerShell, prefira `npm.cmd` se a política de execução bloquear `npm.ps1`.
- Antes de concluir, execute `npm run check` (typecheck, lint, testes e build) e informe os resultados e limitações. A CI não publica artefatos e só executa em repositório público para manter custo zero.
- Não versione `.env` privados, credenciais, banco local, dependências, cobertura ou arquivos gerados. `.gitignore` não protege arquivos já rastreados; revise o conteúdo antes de publicar.
- O responsável escolheu MIT para o código original. Preserve [LICENSE](LICENSE) e [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md); não relicencie dependências nem atribua autoria individual por conta própria.
