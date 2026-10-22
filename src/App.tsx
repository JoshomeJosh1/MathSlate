import { useEffect, useRef, useState } from 'react';
import { preferences, usePreferences } from './app/preferences';
import { useBackends } from './app/services';
import { docActions, docStore } from './document/docStore';
import { documentationDoc } from './document/documentation';
import { emptyDoc, type Doc } from './document/model';
import { openUnsaved, saveSlate, saveState } from './document/persistence';
import { replacedByLink, shareLink } from './document/share';
import { useStore } from './document/store';
import { RowList } from './ui/rows/RowList';
import { SlatesDialog } from './ui/SlatesDialog';

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

/**
 * Saves the main slate as a slate of its own (listed under Slates); a saved slate saves itself on
 * every edit, so the button just says so. Ctrl+S does the same.
 */
function SaveButton() {
  const { slate } = useStore(saveState);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setFailed(!saveSlate(docStore.get()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (slate !== null) {
    return (
      <button
        className="save-button saved"
        title="Saved in this browser; every edit is saved"
        disabled
      >
        Saved
      </button>
    );
  }
  return (
    <button
      className="save-button"
      title="Save this slate in this browser (Ctrl+S); it then saves every edit"
      onClick={() => {
        setFailed(!saveSlate(docStore.get()));
      }}
    >
      {failed ? 'Save failed' : 'Save'}
    </button>
  );
}

/** After a shared link replaced an unsaved slate: offer it back. */
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

/** The main slate was edited and would be lost if replaced. */
function hasUnsavedWork(): boolean {
  const { slate, edited } = saveState.get();
  return slate === null && edited && docStore.get().rows.some((r) => r.latex.trim() !== '');
}

/** A slate to open from the header: an empty one, or the documentation. */
interface Opening {
  make: () => Doc;
}

/** Before a new slate replaces one with unsaved work: save it, or not. */
function OpenSlateDialog({ opening, onClose }: { opening: Opening; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const proceed = () => {
    openUnsaved(docStore, opening.make());
    dialog.current?.close();
  };
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
      <h2 id="open-dialog-title">Save this slate?</h2>
      <p>Your changes to this slate will be lost if you don’t save them.</p>
      {failed && (
        <p className="open-dialog-error">The browser refused to save (storage full or blocked).</p>
      )}
      <div className="open-dialog-buttons">
        <button
          className="primary"
          autoFocus
          onClick={() => {
            if (saveSlate(docStore.get())) proceed();
            else setFailed(true);
          }}
        >
          Save
        </button>
        <button onClick={proceed}>Don’t save</button>
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
  const [showSlates, setShowSlates] = useState(false);
  const open = (next: Opening) => {
    // A saved slate stays saved: the new one simply takes its place in this tab.
    if (hasUnsavedWork()) setOpening(next);
    else openUnsaved(docStore, next.make());
  };
  return (
    <div className="app">
      <header className="app-header">
        <h1>MathSlate</h1>
        <CasStatus />
        <div className="header-actions">
          <button
            onClick={() => {
              open({ make: emptyDoc });
            }}
          >
            New
          </button>
          <button
            title="A slate that demonstrates everything MathSlate can do"
            onClick={() => {
              open({ make: documentationDoc });
            }}
          >
            Documentation
          </button>
          <button
            title="The slates saved in this browser"
            onClick={() => {
              setShowSlates(true);
            }}
          >
            Slates
          </button>
          <SaveButton />
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
      {showSlates && (
        <SlatesDialog
          onClose={() => {
            setShowSlates(false);
          }}
        />
      )}
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
