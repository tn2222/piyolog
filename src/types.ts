export type Env = {
  INGEST_TOKEN: string;
  DATABASE_URL: string;
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

export type PiyologRepository = {
  insertTextExport(input: TextExportInput): Promise<InsertResult>;
  deleteEventsByDates(eventDates: string[]): Promise<void>;
  insertEvents(rawTextExportId: number, events: PiyologEventInput[]): Promise<void>;
};

export type PiyologRepositoryFactory = () => PiyologRepository;
