import { calculateDateRangeDays, type DateRange } from "../domain/periods";
import { metricNames } from "../domain/tools";
import type {
  SummaryPeriodDay,
  SummaryPeriodQueryServiceInterface,
} from "../types";

export type GetRecentBabyLogsInput = {
  range: DateRange;
  includeDiaries: boolean;
  eventTypes: string[] | null;
  summaryPeriodQueryService: SummaryPeriodQueryServiceInterface;
};

export type GetRecentBabyLogsResult = {
  range: DateRange;
  days: SummaryPeriodDay[];
};

const maxRecentBabyLogDays = 35;

export async function getRecentBabyLogs(
  input: GetRecentBabyLogsInput,
): Promise<GetRecentBabyLogsResult> {
  if (calculateDateRangeDays(input.range) > maxRecentBabyLogDays) {
    throw new Error("Date range is too long");
  }

  const summary = await input.summaryPeriodQueryService.summarizePeriod({
    range: input.range,
    granularity: "day",
    includeMetrics: [...metricNames],
  });

  return {
    range: summary.range,
    days: summary.days.map((day) => ({
      date: day.date,
      events: filterEvents(day.events, input.eventTypes),
      journal: input.includeDiaries ? day.journal : null,
    })),
  };
}

function filterEvents(
  events: Record<string, unknown>[],
  eventTypes: string[] | null,
): Record<string, unknown>[] {
  if (eventTypes === null) {
    return events;
  }

  const allowedTypes = new Set(eventTypes);
  return events.filter((event) => allowedTypes.has(String(event.event_type)));
}
