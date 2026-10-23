import { expect, it } from 'vitest';
import { periodMonths, selectPeriod } from '../../src/domain/analytics/period';
import { syntheticRun } from '../fixtures/synthetic/run';
it('単月・複数月・全期間で日本時間の開始月を選ぶ', () => {
  const runs = [
    syntheticRun({ id: 'a', startTime: '2026-09-30T14:59:59Z' }),
    syntheticRun({ id: 'b', startTime: '2026-09-30T15:00:00Z' }),
    syntheticRun({ id: 'c', startTime: '2026-10-31T15:00:00Z' }),
  ];
  expect(
    selectPeriod(runs, { mode: 'single', from: '2026-10', through: '2026-12' }).runs.map(
      (r) => r.id,
    ),
  ).toEqual(['b']);
  expect(
    selectPeriod(runs, { mode: 'range', from: '2026-09', through: '2026-10' }).runs.map(
      (r) => r.id,
    ),
  ).toEqual(['a', 'b']);
  expect(selectPeriod(runs, { mode: 'all', from: '2026-10', through: '2026-10' }).months).toEqual([
    '2026-09',
    '2026-10',
    '2026-11',
  ]);
});
it('年越し・欠損月・逆転・不正月・過大な範囲を扱う', () => {
  expect(periodMonths('2026-12', '2027-02')).toEqual(['2026-12', '2027-01', '2027-02']);
  for (const [from, to] of [
    ['2026-10', '2026-09'],
    ['2026-00', '2026-10'],
    ['1900-01', '9999-12'],
  ])
    expect(periodMonths(from!, to!)).toEqual([]);
  expect(selectPeriod([], { mode: 'all', from: '2026-10', through: '2026-10' }).months).toEqual([
    '2026-10',
  ]);
});
