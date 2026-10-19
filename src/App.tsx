import { useEffect, useRef, useState } from 'react';
import { preferences, usePreferences } from './app/preferences';
import { useBackends } from './app/services';
import { docActions, docStore } from './document/docStore';
import { documentationDoc } from './document/documentation';
import { emptyDoc, type Doc } from './document/model';
import { openInNewTab } from './document/persistence';
import { replacedByLink, shareLink } from './document/share';
import { useStore } from './document/store';
import { RowList } from './ui/rows/RowList';

const STATE_LABEL = { idle: 'idle', loading: 'loading…', ready: 'ready', error: 'failed' } as const;

/** Loading state of every CAS backend, e.g. "SymPy loading… · Nerdamer ready". */
function CasStatus() {
  const backends = useBackends();
  return (
    <span className="cas-status-list" role="status">
      {backends.map((b) => (
        <span
          key={b.id}
          className={`cas-status ${b.status.state}`}
          title={b.status.message ?? `${b.name} ${STATE_LABEL[b.status.state]}`}
        >
          <span className="dot" aria-hidden="true" />
          {b.name} {STATE_LABEL[b.status.state]}
        </span>
      ))}
    </span>
  );
}

/** Per-document choice of the preferred CAS backend. */
function BackendPicker() {
  const doc = useStore(docStore);
  return (
    <label className="toggle" title="Which computer algebra system answers first">
      CAS
      <select
        value={doc.preferredBackend ?? ''}
        onChange={(e) => {
          docActions.setPreferredBackend(e.target.value || null);
        }}
      >
        <option value="">Auto (SymPy)</option>
        <option value="sympy">SymPy</option>
        <option value="nerdamer">Nerdamer</option>
      </select>
    </label>
  );
}

/** Show results as decimals only (a preference of this browser, not of the document). */
function DecimalsToggle() {
  const { decimals } = usePreferences();
  return (
    <label className="toggle" title="Show results as decimals instead of exact values">
      <input
        type="checkbox"
        checked={decimals}
        onChange={(e) => {
          preferences.set({ ...preferences.get(), decimals: e.target.checked });
        }}
      />
      Decimals
    </label>
  );
}

/** Copies a link that opens this slate (the document itself is in the link). */
function ShareButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => {
      setState('idle');
    }, 2000);
    return () => {
      clearTimeout(t);
    };
  }, [state]);
  return (
    <button
      title="Copy a link that opens this slate (everything is in the link; nothing is uploaded)"
      onClick={() => {
        const link = shareLink(docStore.get());
        navigator.clipboard.writeText(link).then(
          () => {
            setState('copied');
          },
          () => {
            // No clipboard access: show the link to copy by hand.
            window.prompt('Copy this link:', link);
          },
        );
      }}
    >
      {state === 'copied' ? 'Link copied' : 'Share'}
    </button>
  );
}

/** After a shared link replaced the user's slate: offer it back. */
function SharedBanner() {
  const previous = useStore(replacedByLink);
  if (!previous) return null;
  return (
    <div className="shared-banner" role="status">
      <span>Opened a shared slate.</span>
      <button
        onClick={() => {
          docActions.replace(previous);
          replacedByLink.set(null);
        }}
      >
        Back to my slate
      </button>
      <button
        className="muted-button"
        onClick={() => {
          replacedByLink.set(null);
        }}
      >
        Keep this one
      </button>
    </div>
  );
}

function hasContent(): boolean {
  return docStore.get().rows.some((r) => r.latex.trim() !== '');
}

/** A slate to open from the header: an empty one, or the documentation. */
interface Opening {
  title: string;
  make: () => Doc;
}

/**
 * Where to open a slate when the current one has content: in a new tab (its own saved slot, see
 * persistence.ts), or in place of this one.
 */
function OpenSlateDialog({ opening, onClose }: { opening: Opening; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="open-dialog"
      aria-labelledby="open-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself, outside its content) cancels.
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <h2 id="open-dialog-title">{opening.title}</h2>
      <p>This slate has content. Open the new one in another tab, or replace this one?</p>
      {blocked && (
        <p className="open-dialog-error">
          The browser blocked the new tab; allow pop-ups, or replace.
        </p>
      )}
      <div className="open-dialog-buttons">
        <button
          autoFocus
          onClick={() => {
            if (openInNewTab(opening.make())) dialog.current?.close();
            else setBlocked(true);
          }}
        >
          Open in new tab
        </button>
        <button
          onClick={() => {
            docActions.replace(opening.make());
            dialog.current?.close();
          }}
        >
          Replace this slate
        </button>
        <button className="muted-button" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export function App() {
  const [showDebug, setShowDebug] = useState(false);
  const [opening, setOpening] = useState<Opening | null>(null);
  const open = (next: Opening) => {
    if (hasContent()) setOpening(next);
    else docActions.replace(next.make());
  };
  return (
    <div className="app">
      <header className="app-header">
        <h1>MathSlate</h1>
        <CasStatus />
        <div className="header-actions">
          <button
            onClick={() => {
              open({ title: 'New slate', make: emptyDoc });
            }}
          >
            New
          </button>
          <button
            title="A slate that demonstrates everything MathSlate can do"
            onClick={() => {
              open({ title: 'Documentation', make: documentationDoc });
            }}
          >
            Documentation
          </button>
          <ShareButton />
          <BackendPicker />
          <DecimalsToggle />
          <label className="toggle">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => {
                setShowDebug(e.target.checked);
              }}
            />
            Debug
          </label>
        </div>
      </header>
      {opening && (
        <OpenSlateDialog
          opening={opening}
          onClose={() => {
            setOpening(null);
          }}
        />
      )}
      <main>
        <SharedBanner />
        <RowList showDebug={showDebug} />
      </main>
    </div>
  );
}
