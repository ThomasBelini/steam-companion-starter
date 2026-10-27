import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { PairingDemo } from '../src/desktop/PairingDemo';
import { desktopPairing, type PairingClient, type PairingStatus } from '../src/desktop/pairing';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }));
afterEach(() => { vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(false); Reflect.deleteProperty(window, '__SC_PAIRING_DEMO__'); });

function native() {
  vi.mocked(isTauri).mockReturnValue(true);
  Object.defineProperty(window, '__SC_PAIRING_DEMO__', { configurable: true, value: true });
}

describe('contrato público do pareamento desktop', () => {
  it('não invoca comandos no navegador ou no desktop normal', async () => {
    expect(await desktopPairing('start')).toBe('unavailable');
    vi.mocked(isTauri).mockReturnValue(true);
    expect(await desktopPairing('status')).toBe('unavailable');
    expect(invoke).not.toHaveBeenCalled();
  });
  it.each(['start', 'approve', 'cancel', 'status'] as const)('limita %s ao comando específico sem argumentos', async action => {
    native(); vi.mocked(invoke).mockResolvedValue('waiting');
    expect(await desktopPairing(action)).toBe('waiting');
    expect(invoke).toHaveBeenCalledExactlyOnceWith(`pairing_demo_${action}`);
  });
  it.each([{ verifier: 'sensitive', code: 'sensitive' }, 'http://127.0.0.1/callback?code=sensitive', 'token=sensitive', null])('descarta payload não permitido: %j', async result => {
    native(); vi.mocked(invoke).mockResolvedValue(result);
    expect(await desktopPairing('status')).toBe('error');
  });
  it('descarta mensagens de erro nativas', async () => {
    native(); vi.mocked(invoke).mockRejectedValue(new Error('code=sensitive'));
    expect(await desktopPairing('start')).toBe('error');
    expect(await desktopPairing('status')).toBe('unavailable');
  });
});

describe('área acessível de demonstração', () => {
  it('explica a indisponibilidade web sem fingir conexão Steam', async () => {
    render(<PairingDemo />);
    expect(screen.getByRole('button', { name: 'Iniciar demonstração' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Demonstração nativa indisponível');
    expect(screen.getByText(/Conta Steam não conectada/)).toBeVisible();
  });
  it('inicia e cancela pelo teclado com mensagens anunciadas', async () => {
    const user = userEvent.setup();
    const client = vi.fn<PairingClient>(async action => action === 'start' ? 'waiting' : action === 'cancel' ? 'cancelled' : 'idle');
    render(<PairingDemo client={client} />);
    const start = screen.getByRole('button', { name: 'Iniciar demonstração' });
    await waitFor(() => expect(start).toBeEnabled());
    await user.tab(); expect(start).toHaveFocus(); await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Cancelar demonstração' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Aguardando confirmação');
    const cancel = screen.getByRole('button', { name: 'Cancelar demonstração' });
    expect(cancel).toHaveFocus(); await user.keyboard(' ');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('cancelada'));
    expect(client).toHaveBeenCalledWith('start'); expect(client).toHaveBeenCalledWith('cancel');
    expect(screen.getByRole('button', { name: 'Iniciar demonstração' })).toHaveFocus();
  });
  it.each(['completed', 'expired', 'error'] as const)('apresenta %s sem atribuir autenticação real', async status => {
    render(<PairingDemo client={async () => status} />);
    await waitFor(() => expect(screen.getByRole(status === 'error' ? 'alert' : 'status')).toHaveTextContent(status === 'completed' ? 'identidade fictícia' : status === 'expired' ? 'expirou' : 'Não foi possível'));
    expect(screen.getByText(/Conta Steam não conectada/)).toBeVisible();
  });
  it('exige confirmação local e instrui o retorno ao navegador', async () => {
    const user = userEvent.setup();
    render(<PairingDemo client={async action => action === 'approve' ? 'return_pending' : 'confirmation_required'} />);
    await user.click(await screen.findByRole('button', { name: 'Confirmar identidade fictícia neste aplicativo' }));
    expect(screen.getByRole('status')).toHaveTextContent('Gerar retorno simulado');
  });
  it('bloqueia cliques simultâneos enquanto o comando está pendente', async () => {
    let finish!: (state: PairingStatus) => void;
    const client = vi.fn<PairingClient>(action => action === 'start' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve('idle'));
    render(<PairingDemo client={client} />);
    const start = screen.getByRole('button', { name: 'Iniciar demonstração' });
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.setup().dblClick(start);
    expect(client.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1);
    await act(async () => { finish('waiting'); });
  });
});
