/** Format a live elapsed-seconds counter into a compact "Xm Ys" / "Xs" string. */
export function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function formatScanDuration(durationMs: number | null | undefined) {
  if (durationMs === null || durationMs === undefined || durationMs < 0) {
    return "In progress";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds === 0) {
    return "< 1 sec";
  }
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} sec`;
}
