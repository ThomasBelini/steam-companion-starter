# Requisitos do produto — v0.1

## Regras obrigatórias

1. Custo adicional zero. Não exigir APIs ou serviços pagos. Planos gratuitos podem impor limitações e não têm garantia de disponibilidade eterna.
2. Aplicativo Windows instalável, preferencialmente, distribuído pelo GitHub.
3. Código público sem credenciais, tokens, cookies ou dados privados.
4. Identificação pelo Steam OpenID oficial, pelo navegador do sistema, sem coletar senha ou Steam Guard.
5. Privacidade por padrão e compartilhamento explícito.

## Módulos

### Biblioteca Steam
- Mostrar jogos, tempo jogado, conquistas obtidas/total, porcentagem; filtros, pesquisa, ordenação.
- Jogos sem conquistas aparecem normalmente.
- Respeitar indisponibilidade de dados privados (erro claro, nunca mostrar '0 jogos' por engano).

### Assistente de conquistas
- Detalhes por jogo; desbloqueadas, bloqueadas, ocultas com controle de spoilers.
- Recomendação não deve confundir raridade com dificuldade.
- Dificuldade, estimativa de tempo e guia devem ter fonte/status de confiança.
- Identificar conquistas perdíveis, online e potencialmente indisponíveis quando houver evidência.
- Referências a guias escritos e YouTube; avisos de versões e datas.

### Preços
- Lojas: Steam, Nuuvem e Eneba; chave ativável no Brasil e no cliente Steam.
- Distinguir preço anunciado do total final (taxas da Eneba podem mudar preço).
- Histórico por loja e mínimo histórico geral, apenas se fonte adequada estiver disponível.
- Não inventar ofertas, disponibilidade, desconto ou histórico.
- Lista de desejos e alertas se tecnicamente viáveis no plano gratuito.

### Conta e banco
- Perfil identificado por SteamID64, sem password local.
- Favoritos, metas, desejos, preferências e privacidade sincronizáveis no backend.
- Não armazenar cópia integral da biblioteca se puder buscar/cachar com prazo.
- Separação robusta entre os dados de usuários.

### Compartilhamento
- Exportar PNG ou JPEG do progresso geral ou por jogo.
- Sem exigir upload para nuvem.
- Perfil compartilhado/publicação só por ação expressa.

## Fora do escopo inicial
- Epic Games, Xbox, conquistas de PlayStation.
- Recursos Steam de escrita, mercado, inventário e trocas.
- IA generativa embutida no app consumindo créditos pagos.
- Pagamentos e compras realizadas dentro do app.
