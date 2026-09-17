import type { DatabaseConnection, TransactionalDatabaseConnection } from "../databaseConnection";

export class DatabaseTransaction {
  constructor(private readonly databaseConnection: TransactionalDatabaseConnection) {}

  async run(work: (transactionConnection: DatabaseConnection) => Promise<void>): Promise<void> {
    const transactionConnection = await this.databaseConnection.begin();
    try {
      await work(transactionConnection);
      await transactionConnection.commit();
    } catch (error) {
      try {
        await transactionConnection.rollback();
      } catch {
      }
      throw error;
    }
  }
}
