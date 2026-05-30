const DEFAULT_BACKFILL_DAYS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getBackfillDays() {
  const raw = (process.env.BACKFILL_DAYS ?? '').toString().trim();
  if (!raw) return DEFAULT_BACKFILL_DAYS;

  const days = Number(raw);
  if (!Number.isFinite(days) || days < 0) return DEFAULT_BACKFILL_DAYS;
  return days;
}

export function getBackfillSinceDate() {
  return new Date(Date.now() - getBackfillDays() * MS_PER_DAY);
}
