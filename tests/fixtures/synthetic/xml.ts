/** Entirely fictitious records. Never loaded by the application itself. */
export function syntheticXml(count: number): string {
  const workouts = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5 + Math.floor(index / 5), (index % 5) * 4 + 1, 1));
    const end = new Date(date.getTime() + (32 + (index % 20)) * 60_000);
    return `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Synthetic Watch" duration="${32 + (index % 20)}" durationUnit="min" totalDistance="${5 + (index % 6)}" totalDistanceUnit="km" startDate="${date.toISOString()}" endDate="${end.toISOString()}">${index % 3 === 0 ? '' : `<WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="${130 + (index % 10)}" unit="count/min"/>`}</Workout>`;
  });
  return `<?xml version="1.0"?><HealthData>${workouts.join('')}</HealthData>`;
}
