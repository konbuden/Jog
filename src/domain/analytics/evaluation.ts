import type { Run } from '../models/run';
import { dateKey } from './time';

export interface EvaluationComponent {
  name: string;
  count: number;
  score: number | null;
  target: number | null;
  median: number | null;
  unit: string;
  condition: string;
}
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
function component(
  name: string,
  target: number | null,
  values: number[],
  tolerance: number,
  unit: string,
  condition: string,
): EvaluationComponent {
  const points =
    target === null || values.length < 3
      ? null
      : (values.reduce(
          (sum, value) =>
            sum + (Math.abs(value - target) <= tolerance ? 0.5 : value > target ? 1 : 0),
          0,
        ) /
          values.length) *
        100;
  return {
    name,
    count: values.length,
    score: points,
    target,
    median: median(values),
    unit,
    condition,
  };
}
/** Local self-comparison, not a medical assessment or a race prediction. */
export function evaluateRun(target: Run, history: readonly Run[]) {
  const at = Date.parse(target.startTime),
    day = dateKey(target.startTime),
    seen = new Set<string>();
  const references = history.filter((run) => {
    const time = Date.parse(run.startTime);
    if (
      run.id === target.id ||
      time >= at ||
      at - time > 90 * 86400000 ||
      dateKey(run.startTime) === day ||
      run.sourceName !== target.sourceName ||
      Math.abs(run.distanceMeters - target.distanceMeters) > target.distanceMeters * 0.2 ||
      (run.details?.indoor !== undefined &&
        target.details?.indoor !== undefined &&
        run.details.indoor !== target.details.indoor)
    )
      return false;
    const key = [
      run.sourceName,
      run.startTime,
      run.endTime,
      run.distanceMeters,
      run.durationSeconds,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const heart = target.averageHeartRateBpm;
  const paceRefs =
    heart === null
      ? []
      : references.filter(
          (run) =>
            run.averageHeartRateBpm !== null && Math.abs(run.averageHeartRateBpm - heart) <= 5,
        );
  const heartRefs =
    heart === null
      ? []
      : references.filter(
          (run) =>
            run.averageHeartRateBpm !== null &&
            Math.abs(run.paceSecondsPerKm - target.paceSecondsPerKm) <= 15,
        );
  const components = [
    component(
      '同じ心拍帯でのペース',
      target.paceSecondsPerKm,
      paceRefs.map((run) => run.paceSecondsPerKm),
      1,
      '秒/km',
      '平均心拍±5bpm・差±1秒/kmは同等',
    ),
    component(
      '同じペース帯での心拍',
      heart,
      heartRefs.map((run) => run.averageHeartRateBpm!),
      1,
      'bpm',
      '平均ペース±15秒/km・差±1bpmは同等',
    ),
  ];
  const usable = components.filter((item) => item.score !== null);
  const score = usable.length
    ? Math.round(usable.reduce((sum, item) => sum + item.score!, 0) / usable.length)
    : null;
  const good = usable
    .filter((item) => item.score! > 50)
    .map(
      (item) => `${item.name}は比較記録に対して良い側でした（参考点${Math.round(item.score!)}）。`,
    );
  const improvements = usable
    .filter((item) => item.score! < 50)
    .map(
      (item) =>
        `${item.name}は比較記録より低い参考点でした（${Math.round(item.score!)}）。気象・起伏・目的の違いは判定できません。`,
    );
  if (!good.length)
    good.push(
      usable.some((item) => item.score === 50)
        ? '比較できた指標では、過去の同条件に近い記録と同等の結果がありました。'
        : '数値から明確に評価できる良い点はありません。記録の蓄積後に再比較してください。',
    );
  if (!improvements.length)
    improvements.push(
      score === null
        ? '比較条件を満たす記録や心拍が不足しており、悪い点は判定できません。'
        : '比較した数値から悪い点は特定できません。疲労やフォームの良否は、この点数では判断できません。',
    );
  const summary =
    score === null
      ? '採点不可：各比較には心拍を取得できた過去記録が3件以上必要です。欠損値は補完しません。'
      : `本人の過去90日との相対比較です。${usable.length}指標を均等に使用し、50点は比較記録と同等の目安です。走力や健康状態の絶対評価ではありません。`;
  const advice = [
    '次回はコース・気象・走行目的をそろえて比較し、体感や体調もご自身のメモに残してください。点数を上げる目的で強度を上げる必要はありません。',
  ];
  if (score === null)
    advice.push(
      '同じ距離帯・記録元で心拍を取得できた記録を蓄積してください。取得できない場合も距離・時間・ペース・10km等速換算は確認できます。',
    );
  return {
    score,
    summary,
    good,
    improvements,
    advice,
    components,
    referenceCount: references.length,
  };
}
export type RunEvaluation = ReturnType<typeof evaluateRun>;
