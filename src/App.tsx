import { useState } from 'react';
import { useCasStatus } from './app/services';
import { docActions, docStore } from './document/docStore';
import { exampleDoc } from './document/examples';
import { emptyDoc } from './document/model';
import { RowList } from './ui/rows/RowList';

function CasStatus() {
  const status = useCasStatus();
  const label =
    status.state === 'ready'
      ? (status.message ?? 'SymPy ready')
      : status.state === 'loading'
        ? (status.message ?? 'Loading SymPy…')
        : status.state === 'error'
          ? (status.message ?? 'SymPy failed to load')
          : 'SymPy idle';
  return (
    <span className={`cas-status ${status.state}`} role="status">
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
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
            onClick={() => {
              if (!hasContent() || window.confirm('Replace this slate with the examples?')) {
                docActions.replace(exampleDoc());
              }
            }}
          >
            Examples
          </button>
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
