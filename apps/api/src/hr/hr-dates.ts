/** Today's date in IST as YYYY-MM-DD (PD-014). "Left" is worked out against this (OQ-134, OQ-141). */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
