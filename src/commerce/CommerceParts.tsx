import { ArrowRight, Heart, Search, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export function DemoPriceNotice() {
  return <section className="commerce-demo-notice" aria-label="Aviso de preços fictícios"><ShieldCheck size={19} aria-hidden="true" />
    <div><strong>Preços inteiramente fictícios nesta demonstração.</strong><p>Sem consulta às lojas. Histórico real, taxas e ativação no Brasil não foram verificados.</p></div>
    <span>DEMO LOCAL</span>
  </section>;
}

export function CommerceSearch({ value, onChange, label, placeholder }: {
  value: string; onChange: (value: string) => void; label: string; placeholder: string;
}) {
  return <label className="commerce-search"><Search size={17} aria-hidden="true" /><input type="search" value={value} onChange={event => onChange(event.target.value)} aria-label={label} placeholder={placeholder} /></label>;
}

export function WishToggle({ title, saved, onToggle }: { title: string; saved: boolean; onToggle: (title: string) => void }) {
  return <button className={`offer-wish ${saved ? 'is-saved' : ''}`} onClick={() => onToggle(title)} aria-pressed={saved}
    aria-label={`${saved ? 'Remover' : 'Adicionar'} ${title} ${saved ? 'da' : 'à'} lista de desejos`} title={saved ? 'Remover dos desejos' : 'Adicionar aos desejos'}>
    <Heart size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
  </button>;
}

export function CommerceEmpty({ title, description, action, onAction, children }: {
  title: string; description: string; action?: string; onAction?: () => void; children?: ReactNode;
}) {
  return <div className="commerce-empty"><div className="commerce-empty-symbol">{children ?? <Search size={27} aria-hidden="true" />}</div>
    <h2>{title}</h2><p>{description}</p>{action && onAction && <button className="commerce-button" onClick={onAction}>{action}<ArrowRight size={15} aria-hidden="true" /></button>}
  </div>;
}
