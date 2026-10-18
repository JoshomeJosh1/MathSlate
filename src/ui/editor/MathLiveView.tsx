import { useMemo } from 'react';
import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';

/** Read-only rendering of LaTeX (output rows). MathLive's static renderer, no editing. */
export function MathLiveView({ latex, className }: { latex: string; className?: string }) {
  const html = useMemo(() => {
    try {
      return convertLatexToMarkup(latex);
    } catch {
      return null;
    }
  }, [latex]);
  if (html === null) return <code className={className}>{latex}</code>;
  return (
    <span
      className={className ? `math-view ${className}` : 'math-view'}
      // MathLive generates this markup from LaTeX produced by our own printer or the CAS.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
