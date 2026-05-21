import type { PiyologEventInput } from "./piyolog";

export type Env = {
  INGEST_TOKEN: string;
  DATABASE_URL: string;
};

export type RawPayloadInput = {
  sourceIp: string | null;
  userAgent: string | null;
  payload: unknown;
};

export type RawPayloadInsertResult = {
  id: number | null;
};

export type RawPayloadRepository = {
  insert(input: RawPayloadInput): Promise<RawPayloadInsertResult>;
  deleteEventsByDates(eventDates: string[]): Promise<void>;
  insertEvents(rawPayloadId: number, events: PiyologEventInput[]): Promise<void>;
};

export type RawPayloadRepositoryFactory = () => RawPayloadRepository;
