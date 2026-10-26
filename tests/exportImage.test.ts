import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportGameCard } from '../src/exportImage';
import type { Game } from '../src/types';

const game: Game = {
  appid: 900,
  title: 'Test Game: Demo!',
  totalMinutes: 60,
  accent: '#123456',
  coverMark: 'T',
  achievements: [true, false, false].map((achieved, index) => ({
    id: String(index), name: 'Conquista de teste', description: '', achieved,
    estimatedDifficulty: 'desconhecida', guideStatus: 'indisponível',
  })),
};

function mockCanvas() {
  const canvas = document.createElement('canvas');
  const link = document.createElement('a');
  const context = {
    fillStyle: '', font: '',
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(), fillText: vi.fn(),
  };
  const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const toDataURL = vi.spyOn(canvas, 'toDataURL').mockImplementation(mime => `data:${mime};base64,ZGVtbw==`);
  const click = vi.spyOn(link, 'click').mockImplementation(() => {});
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    if (tag === 'canvas') return canvas;
    if (tag === 'a') return link;
    return createElement(tag, options);
  });
  return { canvas, link, context, getContext, toDataURL, click };
}

describe('exportação local do cartão', () => {
  let mocks: ReturnType<typeof mockCanvas>;
  beforeEach(() => { mocks = mockCanvas(); });

  it.each([
    ['png', 'image/png', 'png'],
    ['jpeg', 'image/jpeg', 'jpg'],
  ] as const)('solicita %s com MIME, qualidade e nome de arquivo corretos', (format, mime, extension) => {
    exportGameCard(game, format);
    expect(mocks.canvas.width).toBe(1200);
    expect(mocks.canvas.height).toBe(630);
    expect(mocks.toDataURL).toHaveBeenCalledWith(mime, 0.94);
    expect(mocks.link.href).toBe(`data:${mime};base64,ZGVtbw==`);
    expect(mocks.link.download).toBe(`progresso-test-game-demo-.${extension}`);
    expect(mocks.click).toHaveBeenCalledOnce();
  });

  it('desenha a proporção e o arredondamento corretos, identificando dados fictícios', () => {
    exportGameCard(game, 'png');
    expect(mocks.context.fillText).toHaveBeenCalledWith('1 / 3', 106, 378);
    expect(mocks.context.fillText).toHaveBeenCalledWith('33% completo · dados fictícios', 109, 542);
    expect(mocks.context.fillText).toHaveBeenCalledWith('STEAM COMPANION · DEMONSTRAÇÃO', 109, 122);
    expect(mocks.context.fillRect).toHaveBeenCalledWith(109, 470, expect.closeTo(970 / 3), 23);
  });

  it.each([
    { description: 'sem conquistas', achievements: [], total: 0, earned: 0, percent: 0, width: 0 },
    { description: 'nenhuma desbloqueada', achievements: game.achievements.map(a => ({ ...a, achieved: false })), total: 3, earned: 0, percent: 0, width: 0 },
    { description: 'todas desbloqueadas', achievements: game.achievements.map(a => ({ ...a, achieved: true })), total: 3, earned: 3, percent: 100, width: 970 },
  ])('exporta progresso válido para $description', ({ achievements, total, earned, percent, width }) => {
    exportGameCard({ ...game, achievements }, 'png');
    expect(mocks.context.fillText).toHaveBeenCalledWith(`${earned} / ${total}`, 106, 378);
    expect(mocks.context.fillText).toHaveBeenCalledWith(`${percent}% completo · dados fictícios`, 109, 542);
    expect(mocks.context.fillRect).toHaveBeenCalledWith(109, 470, width, 23);
  });

  it('não inicia download se o navegador não disponibilizar contexto 2D', () => {
    mocks.getContext.mockReturnValue(null);
    expect(() => exportGameCard(game, 'png')).toThrow('Canvas não disponível');
    expect(mocks.toDataURL).not.toHaveBeenCalled();
    expect(mocks.click).not.toHaveBeenCalled();
  });

  it('não exporta progresso desconhecido como zero', () => {
    expect(() => exportGameCard({ ...game, achievementsStatus: 'not-loaded', achievements: [] }, 'png')).toThrow('Progresso indisponível');
    expect(() => exportGameCard({ ...game, achievements: game.achievements.map(a => ({ ...a, achieved: null })) }, 'png')).toThrow('Progresso indisponível');
    expect(mocks.click).not.toHaveBeenCalled();
  });

  it('identifica a origem Steam sem rotular dados fornecidos como fictícios', () => {
    exportGameCard({ ...game, source: 'steam', achievementsStatus: 'ready' }, 'png');
    expect(mocks.context.fillText).toHaveBeenCalledWith('STEAM COMPANION · STEAM', 109, 122);
    expect(mocks.context.fillText).toHaveBeenCalledWith('33% completo · dados Steam', 109, 542);
  });

  it('não apresenta jogo explicitamente sem conquistas como 0% completo', () => {
    exportGameCard({ ...game, source: 'steam', achievementsStatus: 'none', achievements: [] }, 'png');
    expect(mocks.context.fillText).toHaveBeenCalledWith('Sem conquistas · dados Steam', 109, 542);
  });
});
