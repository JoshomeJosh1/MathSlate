import { describe, expect, it } from 'vitest';
import { resultDrop } from './resultDrop';

describe('resultDrop', () => {
  const rows = [
    { id: 'a', top: 0, bottom: 40 },
    { id: 'b', top: 40, bottom: 120 },
    { id: 'c', top: 120, bottom: 160 },
  ];

  it('picks the gap nearest the pointer', () => {
    expect(resultDrop(rows, 10)).toEqual({ after: null, y: 0 });
    expect(resultDrop(rows, 30)).toEqual({ after: 'a', y: 40 });
    expect(resultDrop(rows, 79)).toEqual({ after: 'a', y: 40 });
    expect(resultDrop(rows, 81)).toEqual({ after: 'b', y: 120 });
    expect(resultDrop(rows, 150)).toEqual({ after: 'c', y: 160 });
    expect(resultDrop(rows, 500)).toEqual({ after: 'c', y: 160 });
  });

  it('has no gap without rows', () => {
    expect(resultDrop([], 10)).toBeNull();
  });
});
