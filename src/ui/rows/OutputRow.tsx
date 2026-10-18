import type { CasValue } from '../../cas/types';
import type { OutputView } from '../../core/engine';
import { printName } from '../../parser/printLatex';
import { MathView } from '../editor';
import { promotableLatex } from './promote';

interface Props {
  output: OutputView;
  /** Copy the result into new input row(s) below. Absent when the value cannot be promoted. */
  onPromote?: (latexRows: string[]) => void;
  /** Remove an attached command output (auto outputs cannot be removed). */
  onRemove?: () => void;
}

function ValueView({ value }: { value: CasValue }) {
  switch (value.kind) {
    case 'expr':
      return (
        <>
          <MathView latex={value.latex} />
          {value.numeric && (
            <span className="output-numeric">
              <MathView latex={`\\approx ${value.numeric.latex}`} />
            </span>
          )}
        </>
      );
    case 'solutions': {
      if (value.solutions.length === 0) return <span className="muted">no solutions</span>;
      const name = printName(value.variable);
      return <MathView latex={value.solutions.map((s) => `${name}=${s.latex}`).join(',\\quad ')} />;
    }
    case 'boolean':
      return <span>{value.value ? 'true' : 'false'}</span>;
  }
}

export function OutputRow({ output, onPromote, onRemove }: Props) {
  const promotable = promotableLatex(output.value);
  return (
    <div className={`output-row${output.stale ? ' stale' : ''}`}>
      <div
        className="output-gutter"
        title={output.label ? `Refer to this as out_${output.label}` : undefined}
      >
        {output.label !== null ? `out${output.label}` : '='}
      </div>
      <div className="output-body">
        {output.title && <span className="output-title">{output.title}</span>}
        {output.state === 'error' && output.provisional ? (
          // The fallback backend could not do it; the preferred one will once it has loaded.
          <span className="muted" title={output.error}>
            waiting for SymPy…
          </span>
        ) : output.state === 'error' ? (
          <span className="output-error">{output.error}</span>
        ) : output.value ? (
          <ValueView value={output.value} />
        ) : (
          <span className="muted">computing…</span>
        )}
        {output.state === 'ok' && output.provisional && output.backend && (
          <span className="output-backend" title="Preliminary result while SymPy loads">
            via {output.backend}
          </span>
        )}
        {output.state === 'ok' && output.refining && (
          <span
            className="output-backend"
            title="A quick numerical answer; looking for an exact one"
          >
            finding exact value…
          </span>
        )}
        {output.state === 'ok' && output.fallback && output.backend && (
          <span className="output-backend" title="The preferred CAS could not do this">
            via {output.backend}
          </span>
        )}
      </div>
      <div className="output-actions">
        {onPromote && promotable.length > 0 && output.state === 'ok' && (
          <button
            title={promotable.length > 1 ? 'Copy each solution to a new row' : 'Copy to a new row'}
            aria-label="Copy result to a new input row"
            onClick={() => {
              onPromote(promotable);
            }}
          >
            ↧
          </button>
        )}
        {onRemove && (
          <button title="Remove" aria-label="Remove this output" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}
