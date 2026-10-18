/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { runNerdamerJob } from './run';
import type { NerdamerJob } from './serialize';

/** Web Worker hosting Nerdamer, so a hard computation never freezes the page. */
const api = {
  init(): void {
    // Nerdamer is ready as soon as this module has loaded.
  },
  run(job: string): string {
    return JSON.stringify(runNerdamerJob(JSON.parse(job) as NerdamerJob));
  },
};

export type NerdamerWorkerApi = typeof api;

Comlink.expose(api);
