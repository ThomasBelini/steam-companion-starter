import { useEffect, useRef, useState } from 'react';
import { desktopPairing, type PairingClient, type PairingStatus } from './pairing';
import './pairing.css';

const messages: Record<PairingStatus, string> = {
  unavailable: 'Demonstração nativa indisponível. Use a configuração desktop de desenvolvimento indicada na documentação.',
  idle: 'Experimente o pareamento local no navegador externo, sem acessar a Steam.',
  waiting: 'Aguardando confirmação no navegador. Confirme apenas a demonstração iniciada neste computador.',
  confirmation_required: 'O navegador solicitou confirmação. Autorize somente se você acabou de confirmar a demonstração neste computador.',
  return_pending: 'Confirmação local recebida. Volte ao navegador, clique em “Gerar retorno simulado” e depois em “Concluir no aplicativo de laboratório”.',
  completed: 'Demonstração concluída com Piloto Demo (identidade fictícia). Nenhuma conta Steam conectada ou sessão criada.',
  cancelled: 'Demonstração cancelada. Os listeners locais foram encerrados.',
  expired: 'A demonstração expirou. Inicie novamente para tentar outra vez.',
  error: 'Não foi possível concluir a demonstração. Cancele a tentativa antes de iniciar novamente; confira também o navegador padrão.',
};
const active = (status: PairingStatus) => ['waiting', 'confirmation_required', 'return_pending'].includes(status);

export function PairingDemo({ client = desktopPairing }: { client?: PairingClient }) {
  const [status, setStatus] = useState<PairingStatus>('unavailable');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const operation = useRef(0);
  const section = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!busy && restoreFocus.current) {
      section.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      restoreFocus.current = false;
    }
  }, [busy, status]);

  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const revision = operation.current;
      if (!inFlight.current) {
        const next = await client('status');
        if (!stopped && revision === operation.current && !inFlight.current) setStatus(next);
        if (next === 'unavailable') return;
      }
      if (!stopped) timer = setTimeout(() => { void poll(); }, 400);
    };
    void poll();
    return () => { stopped = true; mounted.current = false; clearTimeout(timer); };
    // Leaving this page does not cancel a native attempt. Native timeout/window close owns cleanup.
  }, [client]);

  const run = async (action: 'start' | 'approve' | 'cancel') => {
    if (inFlight.current) return;
    inFlight.current = true;
    operation.current++;
    restoreFocus.current = true;
    setBusy(true);
    const next = await client(action);
    inFlight.current = false;
    if (mounted.current) { setStatus(next); setBusy(false); }
  };

  return <section ref={section} className="pairing-demo" aria-labelledby="pairing-demo-title">
    <div><span className="eyebrow">SIMULAÇÃO LOCAL · SEM LOGIN</span><h3 id="pairing-demo-title">Conexão demonstrativa</h3></div>
    <p>Conta Steam não conectada. Apenas a identidade fictícia Piloto Demo participa deste ensaio.</p>
    <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" aria-atomic="true">{messages[status]}</p>
    <div className="pairing-demo-actions" aria-busy={busy}>
      {!active(status) && status !== 'error' && <button className="primary" disabled={busy || status === 'unavailable'} onClick={() => { void run('start'); }}>Iniciar demonstração</button>}
      {status === 'confirmation_required' && <button className="primary" disabled={busy} onClick={() => { void run('approve'); }}>Confirmar identidade fictícia neste aplicativo</button>}
      {(active(status) || status === 'error') && <button className="secondary" disabled={busy} onClick={() => { void run('cancel'); }}>Cancelar demonstração</button>}
    </div>
  </section>;
}
