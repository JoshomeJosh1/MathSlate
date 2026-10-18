import nerdamer from 'nerdamer';
import type { NerdamerJob } from './serialize';

/** Reply from running a job (JSON-serialised between worker and backend). */
export type NerdamerReply =
  { ok: true; text: string; decimal: string | null } | { ok: false; error: string };

interface Entity {
  text(format?: string): string;
  evaluate(): Entity;
  variables?(): string[];
}

/** Runs one job with Nerdamer. Pure function of the job; used in the worker and in tests. */
export function runNerdamerJob(job: NerdamerJob): NerdamerReply {
  try {
    const result = (nerdamer as unknown as (e: string) => Entity)(job.expr);
    const text = result.text();
    let decimal: string | null = null;
    if (job.numeric && (result.variables?.() ?? ['?']).length === 0) {
      try {
        const d = result.evaluate().text('decimals');
        if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(d) && d !== text) decimal = d;
      } catch {
        // no decimal form
      }
    }
    return { ok: true, text, decimal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
