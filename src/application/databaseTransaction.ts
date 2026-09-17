import type { DatabaseConnection } from "../infrastructure/databaseConnection";

export interface DatabaseTransactionInterface {
  run(work: (connection: DatabaseConnection) => Promise<void>): Promise<void>;
}
