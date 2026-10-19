import { useEffect, useState } from 'react';
import type { CasValue } from '../../cas/types';
import type { OutputView } from '../../core/engine';
import { printName } from '../../parser/printLatex';
import { MathView } from '../editor';
import { usePreferences } from '../../app/preferences';
import { promotableLatex, shownValue } from './promote';

interface Props {
  output: OutputView;
  /** Copy the result into new input row(s) below. Absent when the value cannot be promoted. */
  onPromote?: (latexRows: string[]) => void;
  /** Remove an attached command output (auto outputs cannot be removed). */
  onRemove?: () => void;
  /** Change the command's arguments (clicking its title); absent if it takes none. */
  onEditArgs?: () => void;
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

/** The result as text for the clipboard: its LaTeX (pastes into MathSlate and LaTeX documents). */
function copyText(value: CasValue): string {
  switch (value.kind) {
    case 'expr':
      return value.latex;
    case 'solutions': {
      const name = printName(value.variable);
      return value.solutions.map((s) => `${name}=${s.latex}`).join(',\\quad ');
    }
    case 'boolean':
      return value.value ? 'true' : 'false';
  }
}

function CopyButton({ value }: { value: CasValue }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => {
      setCopied(false);
    }, 1200);
    return () => {
      clearTimeout(t);
    };
  }, [copied]);
  return (
    <button
      title={copied ? 'Copied' : 'Copy LaTeX'}
      aria-label="Copy the result's LaTeX"
      onClick={() => {
        navigator.clipboard.writeText(copyText(value)).then(
          () => {
            setCopied(true);
          },
          () => undefined,
        );
      }}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

export function OutputRow({ output, onPromote, onRemove, onEditArgs }: Props) {
  const { decimals } = usePreferences();
  const value = output.value && shownValue(output.value, decimals);
  const promotable = promotableLatex(value);
  return (
    <div className={`output-row${output.stale ? ' stale' : ''}`}>
      <div
        className="output-gutter"
        title={output.label ? `Refer to this as out_${output.label}` : undefined}
      >
        {output.label !== null ? (
          <span className="output-label">
            out<sub>{output.label}</sub>
          </span>
        ) : (
          '='
        )}
      </div>
      <div className="output-body">
        {output.title &&
          (onEditArgs ? (
            <button
              className="output-title output-title-button"
              title="Change this command's arguments"
              onClick={onEditArgs}
            >
              {output.title}
            </button>
          ) : (
            <span className="output-title">{output.title}</span>
          ))}
        {output.state === 'error' && output.provisional ? (
          // The fallback backend could not do it; the preferred one will once it has loaded.
          <span className="muted" title={output.error}>
            waiting for SymPy…
          </span>
        ) : output.state === 'error' ? (
          <span className="output-error">{output.error}</span>
        ) : value ? (
          <ValueView value={value} />
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
        {output.state === 'ok' && value && <CopyButton value={value} />}
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
