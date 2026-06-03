import type {
  AggregationName,
  CompareGroupByName,
  MetricName,
  SummaryGranularityName,
} from "./domain/tools";
import type { DateRange } from "./domain/periods";

export type Env = {
  INGEST_TOKEN: string;
  DATABASE_URL: string;
  SLACK_COMMAND_TOKEN: string;
  PERSONAL_LLM_GATEWAY_URL: string;
  PERSONAL_LLM_GATEWAY_TOKEN: string;
};

export type PiyologEventInput = {
  babyNickname: string | null;
  eventDate: string;
  occurredAt: string;
  eventType: string;
  amountValue: number | null;
  amountUnit: string | null;
  leftSeconds: number | null;
  rightSeconds: number | null;
  lastSide: string | null;
  rawEvent: Record<string, unknown>;
};

export type InsertResult = {
  id: number | null;
};

export type TextExportInput = {
  source: string;
  fileId: string | null;
  fileName: string | null;
  updatedAt: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  text: string;
};

export type PiyologDiaryInput = {
  babyNickname: string | null;
  babyDateOfBirth: string | null;
  babySex: string | null;
  entryDate: string;
  journal: string;
  rawDay: Record<string, unknown>;
};

export type CompareMetricInput = {
  metric: MetricName;
  currentRange: DateRange;
  previousRange: DateRange;
  aggregation: AggregationName;
  groupBy: CompareGroupByName;
};

export type CompareMetricResult = {
  metric: MetricName;
  currentRange: DateRange;
  previousRange: DateRange;
  rows: Record<string, unknown>[];
};

export type SummarizePeriodInput = {
  range: DateRange;
  granularity: SummaryGranularityName;
  includeMetrics: MetricName[];
};

export type SummarizePeriodResult = {
  range: DateRange;
  granularity: SummaryGranularityName;
  rows: Record<string, unknown>[];
};

export type PiyologRepositoryInterface = {
  insertTextExport(input: TextExportInput): Promise<InsertResult>;
  upsertDiaries(diaries: PiyologDiaryInput[]): Promise<void>;
  deleteEventsByDates(eventDates: string[]): Promise<void>;
  insertEvents(rawTextExportId: number, events: PiyologEventInput[]): Promise<void>;
  compareMetric(input: CompareMetricInput): Promise<CompareMetricResult>;
  summarizePeriod(input: SummarizePeriodInput): Promise<SummarizePeriodResult>;
};

export type PiyologRepositoryFactory = () => PiyologRepositoryInterface;
