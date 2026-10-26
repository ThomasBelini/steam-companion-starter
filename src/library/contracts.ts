import type { Achievement, Game } from '../types';

export type ErrorCode = 'not-configured' | 'invalid-input' | 'access-denied' | 'private-or-unavailable'
  | 'rate-limited' | 'timeout' | 'cancelled' | 'unavailable' | 'invalid-response' | 'incomplete-response';

export type IntegrationError = { code: ErrorCode; message: string; retryAfterSeconds?: number };
export type Result<T> = { ok: true; data: T } | { ok: false; error: IntegrationError };
export type LibraryResult = Result<{ games: Game[]; incomplete: boolean }>;
export type AchievementData = {
  achievements: Achievement[];
  status: NonNullable<Game['achievementsStatus']>;
  error?: IntegrationError;
};

// Mensagens fixas: nunca propagar URL, chave, corpo ou exceção do fornecedor.
const messages: Record<ErrorCode, string> = {
  'not-configured': 'Integração Steam ainda não configurada no servidor.',
  'invalid-input': 'Identificador ou parâmetro inválido.',
  'access-denied': 'Acesso à API negado. Verifique a configuração no servidor.',
  'private-or-unavailable': 'Dados privados ou indisponíveis. A Steam não informou dados suficientes.',
  'rate-limited': 'Limite de consultas atingido. Tente novamente mais tarde.',
  timeout: 'A Steam não respondeu dentro do prazo.',
  cancelled: 'Consulta cancelada.',
  unavailable: 'Steam indisponível no momento.',
  'invalid-response': 'A Steam retornou uma resposta inválida.',
  'incomplete-response': 'A Steam retornou dados incompletos.',
};

export function failure(code: ErrorCode): { ok: false; error: IntegrationError } {
  return { ok: false, error: { code, message: messages[code] } };
}
