/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { loadPyodide, version } from 'pyodide';
import { createSession, type RunProgram } from './session';

/**
 * Web Worker hosting Pyodide + SymPy, so long computations never block the page. The loader is
 * bundled from the `pyodide` npm package; the large runtime files and the SymPy wheels come from
 * the jsDelivr CDN (same version), which keeps the static site small.
 */

const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

let session: Promise<RunProgram> | null = null;

const api = {
  async init(onProgress?: (message: string) => void): Promise<void> {
    session ??= (async () => {
      onProgress?.('Loading Python runtime…');
      const py = await loadPyodide({ indexURL: INDEX_URL });
      onProgress?.('Loading SymPy…');
      return createSession(py);
    })();
    await session;
  },
  async run(code: string): Promise<string> {
    if (!session) throw new Error('SymPy worker not initialised');
    const run = await session;
    return run(code);
  },
};

export type SympyWorkerApi = typeof api;

Comlink.expose(api);
