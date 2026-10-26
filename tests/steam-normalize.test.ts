import { describe, expect, it } from 'vitest';
import { normalizeOwnedGames, normalizePlayerAchievements, normalizeSchema } from '../src/steam/normalize';
import { ownedBody, playerBody, schemaBody, steamId } from './fixtures/steam';

describe('validação das respostas Steam', () => {
  it('normaliza jogos, preservando minutos como unidade de domínio', () => {
    expect(normalizeOwnedGames(ownedBody)).toEqual({ ok: true, data: {
      games: [{ appid: 101, name: 'Jogo de teste', minutes: 120 }], incomplete: false,
    } });
  });

  it('distingue biblioteca explicitamente vazia de resposta vazia ambígua', () => {
    expect(normalizeOwnedGames({ response: { game_count: 0 } })).toEqual({ ok: true, data: { games: [], incomplete: false } });
    expect(normalizeOwnedGames({ response: {} })).toMatchObject({ ok: false, error: { code: 'private-or-unavailable' } });
  });

  it('preserva os jogos e indica contagem e metadados incompletos sem inventar zero minutos', () => {
    expect(normalizeOwnedGames({ response: { game_count: 3, games: [{ appid: 101 }] } })).toEqual({
      ok: true, data: { games: [{ appid: 101, name: null, minutes: null }], incomplete: true },
    });
  });

  it.each([null, [], {}, { response: null }, { response: { game_count: -1, games: [{}] } },
    { response: { games: [{ appid: -1 }] } }, { response: { games: [{ appid: 101 }, { appid: 101 }] } },
    { response: { game_count: 0, games: [{ appid: 101 }] } },
  ])('rejeita resposta de biblioteca malformada ou contraditória: %j', body => {
    expect(normalizeOwnedGames(body)).toMatchObject({ ok: false, error: { code: 'invalid-response' } });
  });

  it.each([{ response: { game_count: 2 } }, { response: { games: [] } }, { response: { game_count: 2, games: [] } }])('não interpreta lista ausente como biblioteca vazia: %j', body => {
    expect(normalizeOwnedGames(body)).toMatchObject({ ok: false, error: { code: 'incomplete-response' } });
  });

  it('valida schema e progresso separadamente e usa identificadores da API', () => {
    expect(normalizeSchema(schemaBody)).toMatchObject({ ok: true, data: [
      { id: 'FIRST', hidden: false }, { id: 'SECRET', hidden: true },
    ] });
    expect(normalizePlayerAchievements(playerBody, steamId)).toEqual({ ok: true, data: [
      { id: 'SECRET', achieved: false }, { id: 'FIRST', achieved: true },
    ] });
  });

  it('exige lista explícita para afirmar que o schema não tem conquistas', () => {
    expect(normalizeSchema({ game: { availableGameStats: { achievements: [] } } })).toEqual({ ok: true, data: [] });
    expect(normalizeSchema({ game: {} })).toMatchObject({ ok: false, error: { code: 'incomplete-response' } });
  });

  it.each([
    { game: { availableGameStats: { achievements: [{ name: 'X' }, { name: 'X' }] } } },
    { game: { availableGameStats: { achievements: [{ name: 'X', hidden: 'false' }] } } },
    { game: { availableGameStats: { achievements: [null] } } },
  ])('rejeita schema inválido: %j', body => {
    expect(normalizeSchema(body)).toMatchObject({ ok: false, error: { code: 'invalid-response' } });
  });

  it('não propaga texto de erro do fornecedor nem declara conquistas inexistentes', () => {
    const result = normalizePlayerAchievements({ playerstats: { success: false, error: 'sensitive upstream text' } }, steamId);
    expect(result).toMatchObject({ ok: false, error: { code: 'private-or-unavailable' } });
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });

  it.each([
    { success: true },
    { success: true, achievements: [{ apiname: 'X', achieved: '0' }] },
    { success: true, achievements: [{ apiname: 'X', achieved: 1 }, { apiname: 'X', achieved: 0 }] },
    { success: true, steamID: '10000000000000001', achievements: [] },
  ])('rejeita progresso ausente, inválido ou de outra identidade: %j', playerstats => {
    expect(normalizePlayerAchievements({ playerstats }, steamId).ok).toBe(false);
  });
});
