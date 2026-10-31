import type { Run } from '../models/run';
import { emptyReview, type RunLap, type RunReview } from '../models/review';
import { validateReview } from './review';
import { dateKey } from './time';
import { equivalent10Km } from './running';
import { formatDate, formatDuration, formatKm, formatPace } from '../format';

export interface EvaluationAxis {
  key: 'tenKm' | 'pacing' | 'reserve';
  name: string;
  assessment: string;
  score: number | null;
  basis: string;
  weight: number;
}
function lapSummary(laps: readonly RunLap[]) {
  const distance = laps.reduce((sum, lap) => sum + lap.distanceMeters, 0),
    duration = laps.reduce((sum, lap) => sum + lap.durationSeconds, 0);
  const mean = distance ? (duration / distance) * 1000 : null;
  const known = laps.filter((lap) => lap.averageHeartRateBpm !== null),
    powered = laps.filter((lap) => lap.averagePowerWatts !== null);
  return {
    count: laps.length,
    pace: mean,
    cv:
      mean === null
        ? null
        : Math.sqrt(
            laps.reduce(
              (sum, lap) =>
                sum +
                lap.distanceMeters *
                  ((lap.durationSeconds / lap.distanceMeters) * 1000 - mean) ** 2,
              0,
            ) / distance,
          ) / mean,
    heart:
      known.length === laps.length && known.length
        ? known.reduce((sum, lap) => sum + lap.averageHeartRateBpm! * lap.durationSeconds, 0) /
          duration
        : null,
    power:
      powered.length === laps.length && powered.length
        ? powered.reduce((sum, lap) => sum + lap.averagePowerWatts! * lap.durationSeconds, 0) /
          duration
        : null,
  };
}
/** Facts and declared context only: no estimated heart rate, intent or recovery. */
export function evaluateRun(
  target: Run,
  history: readonly Run[],
  review: RunReview = emptyReview(target.id),
  monthlyGoalKm = 100,
) {
  const invalid = validateReview(review, target);
  if (invalid) throw new Error(invalid);
  const at = Date.parse(target.startTime),
    day = dateKey(target.startTime),
    seen = new Set<string>();
  const past = history.filter((run) => {
    const time = Date.parse(run.startTime);
    if (
      time >= at ||
      at - time > 90 * 86400000 ||
      dateKey(run.startTime) === day ||
      run.sourceName !== target.sourceName ||
      (run.details?.indoor !== undefined &&
        target.details?.indoor !== undefined &&
        run.details.indoor !== target.details.indoor)
    )
      return false;
    const key = JSON.stringify([
      run.sourceName,
      run.startTime,
      run.endTime,
      run.distanceMeters,
      run.durationSeconds,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const previous = past
    .filter(
      (run) => Math.abs(run.distanceMeters - target.distanceMeters) <= target.distanceMeters * 0.2,
    )
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 5);
  const tenKmDays = new Set(
    past.filter((run) => run.distanceMeters >= 10000).map((run) => dateKey(run.startTime)),
  );
  if (target.distanceMeters >= 10000) tenKmDays.add(day);
  const longest = past.reduce(
    (max, run) => Math.max(max, run.distanceMeters),
    target.distanceMeters,
  );
  const mid: RunLap[] = [],
    late: RunLap[] = [],
    early: RunLap[] = [];
  let offset = 0;
  const lapDistance = review.laps.reduce((sum, lap) => sum + lap.distanceMeters, 0);
  for (const lap of review.laps) {
    const center = (offset + lap.distanceMeters / 2) / lapDistance;
    offset += lap.distanceMeters;
    if (center >= 0.2 && center <= 0.8) mid.push(lap);
    else if (center > 0.8) late.push(lap);
    else early.push(lap);
  }
  const middle = lapSummary(mid),
    finish = lapSummary(late),
    start = lapSummary(early);
  const cv = middle.count >= 2 ? middle.cv : null;
  const pacingScore = review.purpose === 'interval' || cv === null ? null : 100 / (1 + 10 * cv);
  const contradictory =
    review.rpe !== null &&
    ((review.rpe >= 8 && review.extraDistance === 'yes') ||
      (review.rpe <= 3 && review.extraDistance === 'no'));
  const reserveScore =
    review.rpe === null || contradictory || review.discomfort === 'present'
      ? null
      : (100 * (10 - review.rpe)) / 9;
  const axes: EvaluationAxis[] = [
    {
      key: 'tenKm',
      name: '10km走行能力',
      assessment:
        target.distanceMeters >= 10000
          ? tenKmDays.size >= 3
            ? '継続した完走実績あり'
            : '今回の完走実績あり'
          : tenKmDays.size
            ? '過去に完走実績あり・今回は短距離'
            : '10km完走能力は判定保留',
      score: target.distanceMeters >= 10000 ? 100 : null,
      weight: 40,
      basis: `今回${formatKm(target.distanceMeters)}km。対象日を含む過去90日で10km以上の完走は${tenKmDays.size}日、最長${formatKm(longest)}km。短距離の等速換算から完走能力は推定しません。`,
    },
    {
      key: 'pacing',
      name: 'ペース管理能力',
      assessment:
        review.purpose === 'interval'
          ? '一定ペースの採点対象外'
          : cv === null
            ? '判定保留・区間ラップ不足'
            : cv <= 0.03
              ? '中盤のペース変動が小さい'
              : cv <= 0.06
                ? '中盤に一定のペース変動あり'
                : '中盤のペース変動が大きい・条件確認',
      score: pacingScore,
      weight: 30,
      basis:
        cv === null
          ? '全区間が揃ったラップの中盤20〜80%に2区間以上必要です。全体の平均ペースだけでは安定性を判断しません。'
          : `本人入力の中盤${middle.count}区間、平均${formatPace(middle.pace)}/km、距離加重CV ${(cv * 100).toFixed(1)}%。起伏や練習目的は点数だけでは判断できません。`,
    },
    {
      key: 'reserve',
      name: '運動中の余力',
      assessment:
        review.discomfort === 'present'
          ? '違和感あり・点数より状態確認を優先'
          : contradictory
            ? '本人申告に不一致あり・確認待ち'
            : review.rpe === null
              ? review.extraDistance === 'yes'
                ? '余裕あり（本人申告・点数保留）'
                : review.extraDistance === 'no'
                  ? '追加走行の余裕なし（本人申告・点数保留）'
                  : '判定保留・本人の体感未確認'
              : review.rpe <= 4
                ? '余力あり（本人申告）'
                : review.rpe <= 7
                  ? 'ある程度の負荷あり（本人申告）'
                  : '余力は少なめ（本人申告）',
      score: reserveScore,
      weight: 30,
      basis: `終了時RPE：${review.rpe ?? '未入力'} / 10。追加2〜3kmの余裕：${review.extraDistance === 'yes' ? 'あり' : review.extraDistance === 'no' ? 'なし' : '未確認'}。平均/最高心拍から余力や個人の最大心拍を推定しません。`,
    },
  ];
  const available = axes.filter((axis) => axis.score !== null).length;
  const score =
    available === 3
      ? Math.round(axes.reduce((sum, axis) => sum + (axis.score! * axis.weight) / 100, 0))
      : null;
  const good: string[] = [],
    improvements: string[] = [],
    observations: string[] = [],
    advice: string[] = [];
  if (target.distanceMeters >= 10000)
    good.push(
      `${formatKm(target.distanceMeters)}kmを${formatDuration(target.durationSeconds)}で完走しています。10kmを走り切った実績を確認できます。`,
    );
  else
    good.push(
      `${formatKm(target.distanceMeters)}km・${formatDuration(target.durationSeconds)}の走行を積み重ねています。短いジョグの価値を10km未満という理由で減点しません。`,
    );
  if (cv !== null) {
    observations.push(
      `中盤${middle.count}区間は平均${formatPace(middle.pace)}/km、変動係数${(cv * 100).toFixed(1)}%です。`,
    );
    if (cv <= 0.03) good.push('中盤では区間ペースの変動が小さく、一定の走りを続けられています。');
    else
      improvements.push(
        '中盤のペース変動を、起伏・停止・練習の狙いと合わせて確認してください。変動だけでペース管理の失敗とは断定しません。',
      );
  } else
    improvements.push(
      '区間ラップが未入力または不足しているため、中盤の安定性・終盤の失速は判定できません。',
    );
  const finishPaceDelta =
    finish.pace !== null && middle.pace !== null ? finish.pace - middle.pace : null;
  if (finishPaceDelta !== null) {
    const change =
      finishPaceDelta > 10 ? '減速' : finishPaceDelta < -10 ? '加速' : '同程度のペース';
    observations.push(
      `終盤は${formatPace(finish.pace)}/kmで、中盤より${Math.abs(finishPaceDelta).toFixed(0)}秒/km${finishPaceDelta > 0 ? '遅い' : '速い'}記録です。`,
    );
    if (review.lateIntent === 'ease' && finishPaceDelta > 10) {
      good.push(
        '終盤の減速は、本人申告の「意図的に負荷を下げた」という方針と一致しています。疲労による失速とは決めつけません。',
      );
    } else if (review.lateIntent === 'push' && finishPaceDelta < -10)
      good.push(
        '終盤の加速は、本人申告の狙いと一致しています。平均値だけでは見えない終盤の負荷変化があります。',
      );
    else if (review.lateIntent === 'unknown')
      improvements.push(
        `終盤の${change}の意図と体感は未確認です。加速だけで余力あり、減速だけで失速とは判断しません。`,
      );
    else if (
      (review.lateIntent === 'ease' && finishPaceDelta < -10) ||
      (review.lateIntent === 'push' && finishPaceDelta > 10)
    )
      improvements.push(
        '終盤の申告した意図と区間ペースの変化が一致しません。区間入力と走行状況を確認してください。',
      );
  }
  const heartDelta =
    finish.heart !== null && middle.heart !== null ? finish.heart - middle.heart : null;
  if (heartDelta !== null) {
    observations.push(
      `区間平均心拍は中盤${middle.heart!.toFixed(0)}→終盤${finish.heart!.toFixed(0)}bpm（${heartDelta >= 0 ? '+' : ''}${heartDelta.toFixed(0)}）。`,
    );
    if (heartDelta > 3 && finishPaceDelta !== null && finishPaceDelta > 10)
      improvements.push(
        '終盤はペースを落としても心拍が上がっています。心肺への負荷が十分に下がったとは言い切れません。気温・地形・疲労など原因は特定できません。',
      );
  }
  if (finish.power !== null && middle.power !== null && middle.power > 0)
    observations.push(
      `区間平均パワーは中盤${middle.power.toFixed(0)}→終盤${finish.power.toFixed(0)}W（${((finish.power / middle.power - 1) * 100).toFixed(1)}%）。`,
    );
  if (start.pace !== null && middle.pace !== null && Math.abs(start.pace / middle.pace - 1) > 0.15)
    observations.push(
      '序盤のペースは中盤と15%以上異なります。序盤を巡航能力の代表値にせず、計測・地形・ウォームアップの条件を確認してください。',
    );
  const last = previous[0];
  if (last) {
    const paceDelta = target.paceSecondsPerKm - last.paceSecondsPerKm;
    const heartChange =
      target.averageHeartRateBpm !== null && last.averageHeartRateBpm !== null
        ? target.averageHeartRateBpm - last.averageHeartRateBpm
        : null;
    observations.push(
      `${formatDate(last.startTime)}の同距離帯と比べ、10km等速換算は${formatDuration(Math.abs(paceDelta) * 10)}${paceDelta <= 0 ? '短縮' : '増加'}${heartChange === null ? '、心拍の差は不明' : `、平均心拍は${heartChange >= 0 ? '+' : ''}${heartChange.toFixed(0)}bpm`}です。`,
    );
    if (paceDelta < -1 && heartChange !== null && heartChange > 3)
      improvements.push(
        'タイム短縮と心拍上昇が同時に起きています。強度が上がった可能性もあり、短縮のすべてを走力向上とは言い切れません。',
      );
    if (paceDelta < -1 && heartChange !== null && Math.abs(heartChange) <= 3)
      good.push(
        '直近の同距離帯より、近い平均心拍で速いペースを記録しています。条件差は残りますが、前向きな観測結果です。',
      );
  }
  if (review.rpe !== null && review.rpe <= 4 && !contradictory && review.discomfort !== 'present')
    good.push(
      `終了時RPE ${review.rpe}/10という本人申告から、今回の主観的な負担は軽めです。翌日の回復まで確認して継続性を判断します。`,
    );
  if (review.rpe === null)
    improvements.push(
      '終了時のきつさ・追加走行の余裕が未確認です。平均心拍だけでは運動中の余力を判断できません。',
    );
  if (contradictory)
    improvements.push(
      'RPEと追加走行の余裕の申告に不一致があります。余裕の意味や終了時の状態を確認してください。',
    );
  const recovery =
    review.nextDay === 'normal'
      ? '翌日の疲労は普段どおり（本人申告）。今回1回だけで回復力向上とは断定しません。'
      : review.nextDay === 'tired'
        ? '翌日に疲労が残る（本人申告）。継続できる負荷か見直してください。'
        : '翌日回復は判定保留。終了時の体感・心拍だけでは判断せず、翌朝の状態を確認してください。';
  if (review.discomfort === 'present' || review.nextDay === 'tired')
    advice.push(
      '疲労や違和感が残る間は、距離や点数を追わず休養と状態確認を優先してください。気になる症状が続く場合は専門家に相談してください。',
    );
  else if (
    target.distanceMeters >= 10000 &&
    review.extraDistance === 'yes' &&
    review.rpe !== null &&
    review.rpe <= 4
  )
    advice.push(
      '今回は余裕を残した完走という本人の体感があります。次回も同程度の負担で再現できるかを確認し、速さより継続性を優先してください。',
    );
  else
    advice.push(
      '次の走行は、当日と翌朝の疲労・足の違和感を確認してから判断してください。平均ペースだけを目標に強度を上げる必要はありません。',
    );
  if (review.nextDay === 'unknown')
    advice.push(
      '翌朝の疲労を振り返りに追記してください。「今回の負荷を無理なく繰り返せるか」を確認する材料になります。',
    );
  if (review.lateIntent === 'unknown')
    advice.push(
      '終盤に自然に加速したのか、負荷を抑えたのかを振り返りに記録すると、ペース変化を意図に沿って解釈できます。',
    );
  const month = day.slice(0, 7),
    monthSeen = new Set<string>();
  let monthMeters = target.distanceMeters;
  for (const run of history) {
    const key = JSON.stringify([
      run.sourceName,
      run.startTime,
      run.endTime,
      run.distanceMeters,
      run.durationSeconds,
    ]);
    if (
      run.id === target.id ||
      (run.startTime === target.startTime &&
        run.endTime === target.endTime &&
        run.distanceMeters === target.distanceMeters &&
        run.durationSeconds === target.durationSeconds) ||
      Date.parse(run.startTime) > at ||
      dateKey(run.startTime).slice(0, 7) !== month ||
      monthSeen.has(key)
    )
      continue;
    monthSeen.add(key);
    monthMeters += run.distanceMeters;
  }
  if (Number.isFinite(monthlyGoalKm) && monthlyGoalKm > 0)
    advice.push(
      `${month}のこの走行時点で月間${formatKm(monthMeters)}km / 目標${monthlyGoalKm}km${monthMeters / 1000 >= monthlyGoalKm ? 'を達成しています。' : `、残り${formatKm(Math.max(0, monthlyGoalKm * 1000 - monthMeters))}kmです。`}目標のために疲労を押して不足距離を埋める必要はありません。`,
    );
  if (!improvements.length)
    improvements.push(
      '今回の取得値から特定できる改善点はありません。目的・気象・地形・翌日の状態も合わせて確認してください。',
    );
  const summary = [
    `${formatKm(target.distanceMeters)}kmを平均${formatPace(target.paceSecondsPerKm)}/kmで走った記録です。`,
    target.distanceMeters >= 10000
      ? '10km完走を確認できます。'
      : '10km換算は等速換算で、10km完走能力の判定ではありません。',
    review.lateIntent === 'ease'
      ? '終盤は意図的に負荷を下げたという本人申告があります。'
      : review.lateIntent === 'push'
        ? '終盤は意図的に加速したという本人申告があります。'
        : 'ペース変化の意図は未確認です。',
    recovery,
  ].join('');
  return {
    score,
    available,
    axes,
    summary,
    good,
    improvements,
    advice,
    observations,
    recovery,
    previous,
    referenceCount: past.length,
    tenKmDays: tenKmDays.size,
    equivalent10KmSeconds: equivalent10Km(target.distanceMeters, target.durationSeconds),
  };
}
export type RunEvaluation = ReturnType<typeof evaluateRun>;
