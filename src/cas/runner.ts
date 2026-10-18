/**
 * Something that runs a backend program (a string) and returns the backend's JSON reply. Backends
 * use a Web Worker runner in the app and a direct, in-process runner in tests.
 */
export interface ProgramRunner {
  init(onProgress: (message: string) => void): Promise<void>;
  run(code: string): Promise<string>;
  /** Abandon the current computation (e.g. terminate the worker). */
  reset(): void;
}
