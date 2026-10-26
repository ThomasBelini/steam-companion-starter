import { useId, useState } from 'react';
import { Download } from 'lucide-react';

export function GameExport({ format, onFormat, onExport, disabled }: {
  format: 'png' | 'jpeg'; onFormat: (format: 'png' | 'jpeg') => void; onExport: () => void; disabled: boolean;
}) {
  const reasonId = useId();
  const [failed, setFailed] = useState(false);
  const save = () => {
    setFailed(false);
    try { onExport(); } catch { setFailed(true); }
  };
  return <div className="detail-export">
    <div className="detail-export-controls"><label><span>Exportar cartão</span>
      <select aria-label="Formato da exportação" value={format} onChange={event => onFormat(event.target.value as 'png' | 'jpeg')}>
        <option value="png">PNG</option><option value="jpeg">JPEG</option>
      </select></label>
      <button onClick={save} disabled={disabled} aria-describedby={disabled ? reasonId : undefined}><Download size={16} aria-hidden="true" />Exportar</button>
    </div>
    {disabled && <p id={reasonId}>Exportação disponível quando o progresso for conhecido.</p>}
    {failed && <p role="alert">Não foi possível exportar a imagem. Tente novamente.</p>}
  </div>;
}
