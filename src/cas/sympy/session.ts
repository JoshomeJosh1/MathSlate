import runtime from './python/runtime.py?raw';

/** The subset of the Pyodide API we use (so the session works in the worker and in Node tests). */
export interface PyodideLike {
  loadPackage(names: string | string[]): Promise<unknown>;
  runPython(code: string): unknown;
}

export type RunProgram = (code: string) => string;

/** Loads SymPy and the MathSlate runtime into a Pyodide instance. */
export async function createSession(py: PyodideLike): Promise<RunProgram> {
  await py.loadPackage(['sympy']);
  py.runPython(runtime);
  const run = py.runPython('_run_program');
  if (typeof run !== 'function') throw new Error('SymPy runtime failed to load');
  return (code: string) => String((run as (c: string) => unknown)(code));
}
