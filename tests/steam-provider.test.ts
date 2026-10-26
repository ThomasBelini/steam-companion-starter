import { describe, expect, it, vi } from 'vitest';
import { DemoLibraryProvider } from '../src/demo';
import { failure } from '../src/library/contracts';
import { achievementPercent } from '../src/library/progress';
import { SteamLibraryProvider } from '../src/steam/SteamLibraryProvider';
import type { SteamApi } from '../src/steam/contracts';
import { normalizeOwnedGames, normalizePlayerAchievements, normalizeSchema } from '../src/steam/normalize';
import { ownedBody, playerBody, schemaBody, steamId } from './fixtures/steam';

function mockApi() {
  return {
    getOwnedGames: vi.fn<SteamApi['getOwnedGames']>().mockResolvedValue(normalizeOwnedGames(ownedBody)),
    getPlayerAchievements: vi.fn<SteamApi['getPlayerAchievements']>().mockResolvedValue(normalizePlayerAchievements(playerBody, steamId)),
    getSchemaForGame: vi.fn<SteamApi['getSchemaForGame']>().mockResolvedValue(normalizeSchema(schemaBody)),
  };
}

describe('provedores de biblioteca', () => {
  it('demo usa o mesmo contrato e retorna cópias independentes', async () => {
    const provider = new DemoLibraryProvider();
    const first = await provider.getGames();
    first.data.games[0].title = 'Alterado no teste';
    expect((await provider.getGames()).data.games[0].title).toBe('Nebula Drift');
    expect(provider.source).toBe('demo');
  });

  it('mapeia jogos Steam sem consultas em massa ou progresso zero inventado', async () => {
    const api = mockApi();
    const result = await new SteamLibraryProvider(api, steamId).getGames();
    expect(result).toMatchObject({ ok: true, data: { games: [{ appid: 101, title: 'Jogo de teste', totalMinutes: 120, source: 'steam', achievementsStatus: 'not-loaded' }] } });
    if (result.ok) expect(achievementPercent(result.data.games[0])).toBeNull();
    expect(api.getPlayerAchievements).not.toHaveBeenCalled();
    expect(api.getSchemaForGame).not.toHaveBeenCalled();
  });

  it('preserva falha de privacidade como erro, e não como biblioteca vazia', async () => {
    const api = mockApi();
    api.getOwnedGames.mockResolvedValue(failure('private-or-unavailable'));
    expect(await new SteamLibraryProvider(api, steamId).getGames()).toMatchObject({ ok: false, error: { code: 'private-or-unavailable' } });
  });

  it('sinaliza metadados incompletos, usando AppID e tempo desconhecido', async () => {
    const api = mockApi();
    api.getOwnedGames.mockResolvedValue({ ok: true, data: { games: [{ appid: 101, name: null, minutes: null }], incomplete: true } });
    expect(await new SteamLibraryProvider(api, steamId).getGames()).toMatchObject({ ok: true, data: { incomplete: true, games: [{ title: 'App 101', totalMinutes: null }] } });
  });

  it('une conquistas pelo identificador e protege spoilers sem inferir dificuldade', async () => {
    const result = await new SteamLibraryProvider(mockApi(), steamId).getGameAchievements(101);
    expect(result).toMatchObject({ ok: true, data: { status: 'ready', achievements: [
      { id: 'FIRST', achieved: true, name: 'Primeiro passo', estimatedDifficulty: 'desconhecida' },
      { id: 'SECRET', achieved: false, name: 'Conquista oculta', guideStatus: 'indisponível' },
    ] } });
    expect(JSON.stringify(result)).not.toContain('Solução secreta');
  });

  it('não converte progresso ausente em conquista bloqueada', async () => {
    const api = mockApi();
    api.getPlayerAchievements.mockResolvedValue({ ok: true, data: [{ id: 'FIRST', achieved: true }] });
    expect(await new SteamLibraryProvider(api, steamId).getGameAchievements(101)).toMatchObject({ ok: true, data: { status: 'incomplete', achievements: [{ achieved: true }, { achieved: null }] } });
  });

  it('preserva definições quando progresso é privado', async () => {
    const api = mockApi();
    api.getPlayerAchievements.mockResolvedValue(failure('private-or-unavailable'));
    const result = await new SteamLibraryProvider(api, steamId).getGameAchievements(101);
    expect(result).toMatchObject({ ok: true, data: { status: 'private-or-unavailable', error: { code: 'private-or-unavailable' }, achievements: [{ achieved: null }, { achieved: null }] } });
  });

  it('não consulta progresso quando schema explicitamente não tem conquistas', async () => {
    const api = mockApi();
    api.getSchemaForGame.mockResolvedValue({ ok: true, data: [] });
    expect(await new SteamLibraryProvider(api, steamId).getGameAchievements(101)).toEqual({ ok: true, data: { status: 'none', achievements: [] } });
    expect(api.getPlayerAchievements).not.toHaveBeenCalled();
  });

  it('preserva erro de schema e sanitiza exceções de adaptadores', async () => {
    const api = mockApi();
    api.getSchemaForGame.mockResolvedValue(failure('timeout'));
    const provider = new SteamLibraryProvider(api, steamId);
    expect(await provider.getGameAchievements(101)).toMatchObject({ ok: false, error: { code: 'timeout' } });
    api.getOwnedGames.mockRejectedValue(new Error('sensitive data'));
    const result = await provider.getGames();
    expect(result).toMatchObject({ ok: false, error: { code: 'unavailable' } });
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });

  it('rejeita parâmetros inválidos antes de acessar o adaptador', async () => {
    const api = mockApi();
    expect((await new SteamLibraryProvider(api, 'invalid').getGames()).ok).toBe(false);
    expect((await new SteamLibraryProvider(api, steamId).getGameAchievements(-1)).ok).toBe(false);
    expect(api.getOwnedGames).not.toHaveBeenCalled();
    expect(api.getSchemaForGame).not.toHaveBeenCalled();
  });

  it('preserva indisponibilidade parcial das conquistas sem descartar os jogos', async () => {
    const api = mockApi();
    api.getPlayerAchievements.mockResolvedValue(failure('rate-limited'));
    const provider = new SteamLibraryProvider(api, steamId);
    expect((await provider.getGames()).ok).toBe(true);
    expect(await provider.getGameAchievements(101)).toMatchObject({ ok: true, data: {
      status: 'unavailable', error: { code: 'rate-limited' }, achievements: [{ achieved: null }, { achieved: null }],
    } });
  });

  it('sinaliza progresso com conquistas desconhecidas no schema como incompleto', async () => {
    const api = mockApi();
    api.getPlayerAchievements.mockResolvedValue({ ok: true, data: [
      { id: 'FIRST', achieved: true }, { id: 'SECRET', achieved: false }, { id: 'NEW', achieved: true },
    ] });
    expect(await new SteamLibraryProvider(api, steamId).getGameAchievements(101)).toMatchObject({ ok: true, data: { status: 'incomplete' } });
  });

  it('revela a descrição de uma conquista oculta já desbloqueada', async () => {
    const api = mockApi();
    api.getPlayerAchievements.mockResolvedValue({ ok: true, data: [{ id: 'FIRST', achieved: true }, { id: 'SECRET', achieved: true }] });
    expect(await new SteamLibraryProvider(api, steamId).getGameAchievements(101)).toMatchObject({ ok: true, data: {
      achievements: [{ id: 'FIRST' }, { id: 'SECRET', name: 'Título secreto', description: 'Solução secreta.' }],
    } });
  });

  it('respeita cancelamento antes de consultar ou depois de uma resposta atrasada', async () => {
    const api = mockApi();
    const controller = new AbortController();
    api.getOwnedGames.mockImplementation(async () => {
      controller.abort();
      return normalizeOwnedGames(ownedBody);
    });
    const provider = new SteamLibraryProvider(api, steamId);
    expect(await provider.getGames(controller.signal)).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(await provider.getGameAchievements(101, controller.signal)).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(api.getSchemaForGame).not.toHaveBeenCalled();
  });
});
