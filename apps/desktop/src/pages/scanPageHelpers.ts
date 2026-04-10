export function formatScanDuration(durationMs: number | null | undefined) {
  if (durationMs === null || durationMs === undefined || durationMs < 0) {
    return "In progress";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} sec`;
}
