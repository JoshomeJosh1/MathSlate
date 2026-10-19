import { useEffect, useRef, useState } from 'react';
import { deleteSlate, listSlates, slateHref, type SlateInfo } from '../document/slates';
import { MathView } from './editor';

/** "just now", "5 min ago", "3 h ago", "yesterday", else the date. */
function whenEdited(updated: number | null, now: number): string {
  if (updated === null) return '';
  const minutes = Math.round((now - updated) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return new Date(updated).toLocaleDateString();
}

function SlateName({ slate }: { slate: SlateInfo }) {
  const { title } = slate;
  if (title === null) return <span className="muted">Empty slate</span>;
  if (title.kind === 'text') return <span>{title.text}</span>;
  return <MathView latex={title.latex} />;
}

/**
 * The slates saved in this browser (slates.ts): open one here (or in a new tab, as a link), or
 * delete it.
 */
export function SlatesDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [slates, setSlates] = useState<SlateInfo[]>(() => listSlates(localStorage));
  const [now] = useState(() => Date.now());
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="open-dialog slates-dialog"
      aria-labelledby="slates-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <h2 id="slates-title">Slates in this browser</h2>
      <p>Click one to open it here; Ctrl+click or middle-click opens it in a new tab.</p>
      <ul className="slates-list">
        {slates.map((slate) => (
          <li key={slate.id ?? 'main'} className={slate.current ? 'current' : undefined}>
            <a href={slateHref(slate.id)} className="slate-link">
              <span className="slate-name">
                <SlateName slate={slate} />
              </span>
              <span className="slate-meta">
                {[
                  slate.current ? 'this tab' : slate.id === null ? 'main slate' : null,
                  `${slate.rows} ${slate.rows === 1 ? 'row' : 'rows'}`,
                  whenEdited(slate.updated, now),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </a>
            {!slate.current && (
              <button
                className="slate-delete"
                title="Delete this slate"
                aria-label="Delete this slate"
                onClick={() => {
                  if (window.confirm('Delete this slate? This cannot be undone.')) {
                    deleteSlate(localStorage, slate.id);
                    setSlates(listSlates(localStorage));
                  }
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="open-dialog-buttons">
        <button className="muted-button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  );
}
