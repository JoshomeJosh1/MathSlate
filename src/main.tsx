import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { docStore } from './document/docStore';
import { autosave } from './document/persistence';
import { openSharedLink } from './document/share';
import './styles.css';

// A shared link (#s=…) opens its slate, as an unsaved one; then saved slates save every edit.
openSharedLink();
window.addEventListener('hashchange', openSharedLink);
autosave(docStore);

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
