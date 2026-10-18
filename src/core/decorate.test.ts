import { describe, expect, it } from 'vitest';
import { analyzeRows } from './analyze';
import { decorateLatex, nameShortcuts } from './decorate';

/** Decorates every row in context, repeatedly until stable (as the app does), and returns them. */
function decorate(...latex: string[]): string[] {
  let rows = latex;
  for (let round = 0; round < 3; round++) {
    const analyses = analyzeRows(rows.map((l, i) => ({ id: `r${i}`, latex: l })));
    rows = analyses.map((a) => decorateLatex(a.latex, a.names));
  }
  return rows;
}

describe('upright display of recognised multi-letter names', () => {
  it('decorates the definition and every use', () => {
    expect(decorate('speed=12', 'time=3', 'distance=speed\\cdot time')).toEqual([
      '\\mathrm{speed}=12',
      '\\mathrm{time}=3',
      '\\mathrm{distance}=\\mathrm{speed}\\cdot \\mathrm{time}',
    ]);
  });

  it('decorates inside larger expressions, calls and subscripted names', () => {
    expect(decorate('rate=2', '2rate^2+rates')).toEqual([
      '\\mathrm{rate}=2',
      '2\\mathrm{rate}^2+\\mathrm{rate}s',
    ]);
    expect(decorate('area(r)=\\pi r^2', 'area(3)')).toEqual([
      '\\mathrm{area}(r)=\\pi r^2',
      '\\mathrm{area}(3)',
    ]);
    expect(decorate('v_{max}=3', 'speed_1=4', 'speed_1+v_{max}')).toEqual([
      'v_{max}=3',
      '\\mathrm{speed}_1=4',
      '\\mathrm{speed}_1+v_{max}',
    ]);
  });

  it('leaves single letters and undefined runs alone', () => {
    expect(decorate('xy+2ab', 'x=1')).toEqual(['xy+2ab', 'x=1']);
  });

  it('reverts names that are no longer defined', () => {
    expect(decorate('2\\mathrm{speed}')).toEqual(['2speed']);
  });

  it('writes built-in functions typed as letters as operator names', () => {
    expect(decorate('lcm(4,6)')).toEqual(['\\operatorname{lcm}(4,6)']);
    expect(decorate('\\operatorname{speed}+1')).toEqual(['\\operatorname{speed}+1']);
  });

  it('keeps the meaning unchanged', () => {
    const before = analyzeRows(
      ['speed=12', 'time=3', 'distance=speed\\cdot time'].map((latex, i) => ({
        id: `r${i}`,
        latex,
      })),
    );
    const after = analyzeRows(
      decorate('speed=12', 'time=3', 'distance=speed\\cdot time').map((latex, i) => ({
        id: `r${i}`,
        latex,
      })),
    );
    expect(after.map((a) => a.statement)).toMatchObject(
      before.map((b) => ({ kind: b.statement?.kind })),
    );
    expect(after.map((a) => a.refs)).toEqual(before.map((b) => b.refs));
  });

  it('extends a name typed after an upright one into a new definition', () => {
    // Typing "speedy=5" when speed is defined: the shortcut makes \mathrm{speed}y.
    expect(decorate('speed=1', '\\mathrm{speed}y=5', 'speedy')).toEqual([
      '\\mathrm{speed}=1',
      '\\mathrm{speedy}=5',
      '\\mathrm{speedy}',
    ]);
  });

  it('offers inline shortcuts for defined multi-letter names', () => {
    const analyses = analyzeRows(
      ['speed=1', 'f(x)=x', 'area(r)=r', 'x_1=2'].map((latex, i) => ({ id: `r${i}`, latex })),
    );
    expect(nameShortcuts(analyses)).toEqual({ speed: '\\mathrm{speed}', area: '\\mathrm{area}' });
  });
});
