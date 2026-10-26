export type Bindings = {
  DB: D1Database;
  // Apenas o binding é reservado. Não existe leitura deste segredo pelas rotas atuais.
  STEAM_API_KEY?: string;
};
import type { D1Database } from '@cloudflare/workers-types';
