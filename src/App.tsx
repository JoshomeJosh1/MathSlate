import { useState } from 'react';
import { preferences, usePreferences } from './app/preferences';
import { useBackends } from './app/services';
import { docActions, docStore } from './document/docStore';
import { documentationDoc } from './document/documentation';
import { emptyDoc } from './document/model';
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

function hasContent(): boolean {
  return docStore.get().rows.some((r) => r.latex.trim() !== '');
}

export function App() {
  const [showDebug, setShowDebug] = useState(false);
  return (
    <div className="app">
      <header className="app-header">
        <h1>MathSlate</h1>
        <CasStatus />
        <div className="header-actions">
          <button
            onClick={() => {
              if (!hasContent() || window.confirm('Replace this slate with a new empty one?')) {
                docActions.replace(emptyDoc());
              }
            }}
          >
            New
          </button>
          <button
            title="A slate that demonstrates everything MathSlate can do"
            onClick={() => {
              if (!hasContent() || window.confirm('Replace this slate with the documentation?')) {
                docActions.replace(documentationDoc());
              }
            }}
          >
            Documentation
          </button>
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
      <main>
        <RowList showDebug={showDebug} />
      </main>
    </div>
  );
}
