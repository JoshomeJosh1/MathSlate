import { useState } from 'react';
import { RowList } from './ui/rows/RowList';

export function App() {
  const [showDebug, setShowDebug] = useState(true);
  return (
    <div className="app">
      <header className="app-header">
        <h1>MathSlate</h1>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => {
              setShowDebug(e.target.checked);
            }}
          />
          Show LaTeX / AST
        </label>
      </header>
      <main>
        <RowList showDebug={showDebug} />
      </main>
    </div>
  );
}
