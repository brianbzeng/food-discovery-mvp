export type OpeningHoursRecord = {
  restaurant_id: string;
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: number;
};

const weekdayIndexes: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function localDayAndTime(
  timezone: string,
  now = new Date(),
): { dayOfWeek: number; time: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return {
      dayOfWeek: weekdayIndexes[weekday] ?? now.getUTCDay(),
      time: `${hour}:${minute}`,
    };
  } catch {
    return {
      dayOfWeek: now.getUTCDay(),
      time: `${String(now.getUTCHours()).padStart(2, "0")}:${String(
        now.getUTCMinutes(),
      ).padStart(2, "0")}`,
    };
  }
}

export function hoursAreOpen(
  hours: OpeningHoursRecord,
  local: { dayOfWeek: number; time: string },
): boolean {
  if (
    hours.is_closed ||
    !hours.opens_at ||
    !hours.closes_at
  ) {
    return false;
  }
  if (hours.opens_at <= hours.closes_at) {
    return (
      hours.day_of_week === local.dayOfWeek &&
      local.time >= hours.opens_at &&
      local.time < hours.closes_at
    );
  }

  const previousDay = (local.dayOfWeek + 6) % 7;
  return (
    (hours.day_of_week === local.dayOfWeek &&
      local.time >= hours.opens_at) ||
    (hours.day_of_week === previousDay && local.time < hours.closes_at)
  );
}
