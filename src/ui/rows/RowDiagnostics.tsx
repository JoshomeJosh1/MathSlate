import type { RowAnalysis } from '../../core/analyze';
import type { MathError } from '../../parser/errors';
import { statementToSexpr } from '../../parser/sexpr';

/** Per-row error message with the offending part of the LaTeX highlighted. */
export function RowError({ latex, error }: { latex: string; error: MathError }) {
  const { start, end } = error.span;
  return (
    <div className="row-error" role="alert">
      <span className="row-error-message">{error.message}</span>
      {latex !== '' && (
        <code className="row-error-source">
          {latex.slice(0, start)}
          <mark>{start === end ? ' ' : latex.slice(start, end)}</mark>
          {latex.slice(end)}
        </code>
      )}
    </div>
  );
}

/** Debug view: raw LaTeX and the resolved AST as an S-expression. */
export function RowDebug({
  latex,
  analysis,
}: {
  latex: string;
  analysis: RowAnalysis | undefined;
}) {
  const interpretations = analysis ? [...analysis.interpretations] : [];
  return (
    <div className="row-debug" aria-label="Debug information">
      <div>{latex === '' ? <span className="muted">(empty)</span> : latex}</div>
      {analysis?.statement && <div className="row-ast">{statementToSexpr(analysis.statement)}</div>}
      {interpretations.length > 0 && (
        <div className="muted">
          {interpretations.map(([symbol, option]) => `${symbol} → ${option}`).join(', ')}
        </div>
      )}
    </div>
  );
}
