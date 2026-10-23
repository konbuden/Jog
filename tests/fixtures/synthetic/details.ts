import { readFileSync } from 'node:fs';
export const baseXml = readFileSync(new URL('./export.xml', import.meta.url), 'utf8');
export const detailedXml = baseXml.replace('average="135"', 'average="135" maximum="170"').replace(
  '</Workout>',
  `
<WorkoutStatistics type="HKQuantityTypeIdentifierStepCount" sum="5400" unit="count"/>
<WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="1255.2" unit="kJ"/>
<WorkoutStatistics type="HKQuantityTypeIdentifierRunningPower" average="250" unit="W"/>
<WorkoutStatistics type="HKQuantityTypeIdentifierRunningStrideLength" average="110" unit="cm"/>
<WorkoutStatistics type="HKQuantityTypeIdentifierRunningGroundContactTime" average="0.25" unit="s"/>
<WorkoutStatistics type="HKQuantityTypeIdentifierRunningVerticalOscillation" average="0.08" unit="m"/>
<MetadataEntry key="HKIndoorWorkout" value="0"/>
<MetadataEntry key="HKElevationAscended" value="40 m"/>
<WorkoutRoute><FileReference path="/workout-routes/synthetic.gpx"/></WorkoutRoute>
</Workout>`,
);
export const gpx = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0.01" lon="0.01"/><trkpt lat="0" lon="0.02"/></trkseg><trkseg><trkpt lat="0.01" lon="0.03"/><trkpt lat="0" lon="0.04"/></trkseg></trk></gpx>`;
