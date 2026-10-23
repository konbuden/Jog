import type { RunDetails } from '../../domain/models/run';
type Attributes = Record<string, string>;
export const DETAIL_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRunningCadence',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierRunningPower',
  'HKQuantityTypeIdentifierRunningStrideLength',
  'HKQuantityTypeIdentifierRunningGroundContactTime',
  'HKQuantityTypeIdentifierRunningVerticalOscillation',
];
export const DETAIL_KEYS = [
  'HKIndoorWorkout',
  'HKMetadataKeyIndoorWorkout',
  'HKElevationAscended',
  'HKMetadataKeyElevationAscended',
  'HKWorkoutBrandName',
];
export function workoutDetails(
  stats: Attributes[],
  metadata: Attributes,
  attrs: Attributes,
  duration: number,
  routeFiles: string[],
): RunDetails {
  const details: RunDetails = {};
  const number = (value: string | undefined, scale = 1) => {
    if (!value?.trim() || !/^[+]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.trim()))
      return undefined;
    const result = Number(value) * scale;
    return Number.isFinite(result) && result >= 0 ? result : undefined;
  };
  const statistic = (type: string, field: string, units: Record<string, number>) => {
    const matches = stats.filter((s) => s.type === `HKQuantityTypeIdentifier${type}`);
    if (matches.length !== 1) return undefined;
    const stat = matches[0]!;
    return stat.unit && units[stat.unit] !== undefined
      ? number(stat[field], units[stat.unit])
      : undefined;
  };
  details.totalSteps = statistic('StepCount', 'sum', { count: 1 });
  details.averageCadenceSpm = statistic('RunningCadence', 'average', {
    'count/min': 1,
    'count/s': 60,
  });
  if (details.averageCadenceSpm !== undefined) details.cadenceOrigin = 'statistics';
  else if (details.totalSteps !== undefined && details.totalSteps > 0) {
    details.averageCadenceSpm = (details.totalSteps * 60) / duration;
    details.cadenceOrigin = 'steps-duration';
  }
  details.activeEnergyKcal = statistic('ActiveEnergyBurned', 'sum', {
    kcal: 1,
    kJ: 1 / 4.184,
    J: 1 / 4184,
    cal: 1 / 1000,
  });
  if (
    !stats.some((s) => s.type === 'HKQuantityTypeIdentifierActiveEnergyBurned') &&
    attrs.totalEnergyBurnedUnit
  ) {
    const scale = (
      { kcal: 1, kJ: 1 / 4.184, J: 1 / 4184, cal: 1 / 1000 } as Record<string, number>
    )[attrs.totalEnergyBurnedUnit];
    if (scale !== undefined) details.activeEnergyKcal = number(attrs.totalEnergyBurned, scale);
  }
  details.averagePowerWatts = statistic('RunningPower', 'average', { W: 1, kW: 1000 });
  details.averageStrideLengthMeters = statistic('RunningStrideLength', 'average', {
    m: 1,
    cm: 0.01,
    ft: 0.3048,
  });
  details.averageGroundContactMilliseconds = statistic('RunningGroundContactTime', 'average', {
    ms: 1,
    s: 1000,
  });
  details.averageVerticalOscillationCentimeters = statistic(
    'RunningVerticalOscillation',
    'average',
    { cm: 1, m: 100 },
  );
  details.maximumHeartRateBpm = statistic('HeartRate', 'maximum', { 'count/min': 1, bpm: 1 });
  if (details.maximumHeartRateBpm === 0) delete details.maximumHeartRateBpm;
  const indoor = metadata.HKIndoorWorkout ?? metadata.HKMetadataKeyIndoorWorkout;
  if (indoor === '1' || indoor === '0') details.indoor = indoor === '1';
  const elevation = /^(\d+(?:\.\d+)?)\s*(m|cm|km|ft)$/.exec(
    metadata.HKElevationAscended ?? metadata.HKMetadataKeyElevationAscended ?? '',
  );
  if (elevation)
    details.elevationAscendedMeters = number(
      elevation[1],
      ({ m: 1, cm: 0.01, km: 1000, ft: 0.3048 } as Record<string, number>)[elevation[2]!],
    );
  if (metadata.HKWorkoutBrandName) details.workoutName = metadata.HKWorkoutBrandName.slice(0, 200);
  if (routeFiles.length) details.routeFiles = routeFiles;
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}
