import { useState } from 'react';
import { RowList } from './ui/rows/RowList';

export function App() {
  const [showLatex, setShowLatex] = useState(true);
  return (
    <div className="app">
      <header className="app-header">
        <h1>MathSlate</h1>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showLatex}
            onChange={(e) => {
              setShowLatex(e.target.checked);
            }}
          />
          Show LaTeX
        </label>
      </header>
      <main>
        <RowList showLatex={showLatex} />
      </main>
    </div>
  );
}
