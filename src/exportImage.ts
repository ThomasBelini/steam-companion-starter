import type { Game } from './types';

function saveCanvas(canvas: HTMLCanvasElement, format: 'png' | 'jpeg', fileName: string) {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const link = document.createElement('a');
  link.href = canvas.toDataURL(mime, 0.94);
  link.download = `${fileName}.${format === 'jpeg' ? 'jpg' : 'png'}`;
  link.click();
}

export function exportGameCard(game: Game, format: 'png' | 'jpeg') {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não disponível');

  const earned = game.achievements.filter(a => a.achieved).length;
  const total = game.achievements.length;
  const progress = total ? earned / total : 0;
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#131b2b');
  gradient.addColorStop(1, '#0b0f19');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.fillStyle = game.accent;
  ctx.fillRect(72, 82, 8, 458);
  ctx.fillStyle = '#9ba8be';
  ctx.font = 'bold 27px Arial, sans-serif';
  ctx.fillText('STEAM COMPANION · DEMONSTRAÇÃO', 109, 122);
  ctx.fillStyle = '#f2f5fb';
  ctx.font = 'bold 68px Arial, sans-serif';
  ctx.fillText(game.title, 106, 241, 1000);
  ctx.font = 'bold 95px Arial, sans-serif';
  ctx.fillText(`${earned} / ${total}`, 106, 378);
  ctx.fillStyle = '#9ba8be';
  ctx.font = '30px Arial, sans-serif';
  ctx.fillText('conquistas desbloqueadas', 110, 424);
  ctx.fillStyle = '#253248';
  ctx.fillRect(109, 470, 970, 23);
  ctx.fillStyle = '#68d6ac';
  ctx.fillRect(109, 470, 970 * progress, 23);
  ctx.fillStyle = '#9ba8be';
  ctx.font = '24px Arial, sans-serif';
  ctx.fillText(`${Math.round(progress * 100)}% completo · dados fictícios`, 109, 542);
  saveCanvas(canvas, format, `progresso-${game.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
}
