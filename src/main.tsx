import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { docStore } from './document/docStore';
import { autosave } from './document/persistence';
import './styles.css';

autosave(docStore);

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
