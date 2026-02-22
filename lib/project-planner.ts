export type PlannerCadence = "daily" | "weekly" | "monthly";

export type GeneratedMilestone = {
  index: number;
  title: string;
  startAt: Date;
  dueAt: Date;
};

export type GeneratedCheckIn = {
  milestoneIndex: number;
  scheduledAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function parseCheckInTime(value: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function computeMilestoneCount(
  cadence: PlannerCadence,
  deadlineAt: Date,
  now: Date = new Date()
): { count: number; error?: string } {
  const diffMs = deadlineAt.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { count: 0, error: "Deadline must be in the future." };
  }

  const daysUntilDeadline = Math.ceil(diffMs / DAY_MS);

  if (cadence === "daily") {
    const count = Math.ceil(daysUntilDeadline / 1);
    if (count > 14) {
      return {
        count: 0,
        error: "Daily cadence supports up to 14 milestones. Choose weekly for longer plans.",
      };
    }
    return { count: Math.max(1, count) };
  }

  if (cadence === "weekly") {
    return { count: Math.max(1, Math.ceil(daysUntilDeadline / 7)) };
  }

  return { count: Math.max(1, Math.ceil(daysUntilDeadline / 30)) };
}

function cadencePeriodDays(cadence: PlannerCadence): number {
  if (cadence === "daily") return 1;
  if (cadence === "weekly") return 7;
  return 30;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

function getDatePartsInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
  };
}

function getDateTimePartsInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
  };
}

function zonedDateTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const targetAsUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(targetAsUTC);

  // Iterate to converge around DST transitions.
  for (let i = 0; i < 3; i += 1) {
    const zoned = getDateTimePartsInTimeZone(guess, timezone);
    const zonedAsUTC = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    const diff = targetAsUTC - zonedAsUTC;
    if (diff === 0) return guess;
    guess = new Date(guess.getTime() + diff);
  }

  return guess;
}

export function generatePlannerSchedule(input: {
  cadence: PlannerCadence;
  deadlineAt: Date;
  checkInTime: string;
  timezone: string;
  now?: Date;
  milestoneTitles?: string[];
}): { milestones: GeneratedMilestone[]; checkIns: GeneratedCheckIn[] } {
  const now = input.now ?? new Date();
  if (!isValidTimeZone(input.timezone)) {
    throw new Error("Invalid timezone.");
  }
  const checkIn = parseCheckInTime(input.checkInTime);
  if (!checkIn) {
    throw new Error("checkInTime must use HH:MM 24-hour format.");
  }

  const countResult = computeMilestoneCount(input.cadence, input.deadlineAt, now);
  if (countResult.error) {
    throw new Error(countResult.error);
  }

  const count = countResult.count;
  const periodDays = cadencePeriodDays(input.cadence);
  const milestones: GeneratedMilestone[] = [];
  const checkIns: GeneratedCheckIn[] = [];

  let startAt = new Date(now);
  for (let i = 0; i < count; i += 1) {
    const dueAt =
      i === count - 1
        ? new Date(input.deadlineAt)
        : new Date(
            Math.min(
              addDays(now, periodDays * (i + 1)).getTime(),
              input.deadlineAt.getTime()
            )
          );

    const providedTitle = input.milestoneTitles?.[i]?.trim();
    const title = providedTitle && providedTitle.length > 0 ? providedTitle : `Milestone ${i + 1}`;

    milestones.push({
      index: i + 1,
      title,
      startAt: new Date(startAt),
      dueAt,
    });

    const dueDateParts = getDatePartsInTimeZone(dueAt, input.timezone);
    checkIns.push({
      milestoneIndex: i + 1,
      scheduledAt: zonedDateTimeToUtc(
        input.timezone,
        dueDateParts.year,
        dueDateParts.month,
        dueDateParts.day,
        checkIn.hour,
        checkIn.minute
      ),
    });

    startAt = dueAt;
  }

  return { milestones, checkIns };
}
