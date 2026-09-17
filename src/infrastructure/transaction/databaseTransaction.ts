import type { DatabaseConnection, TransactionalDatabaseConnection } from "../databaseConnection";

export class DatabaseTransaction {
  constructor(private readonly connection: TransactionalDatabaseConnection) {}

  async run(work: (connection: DatabaseConnection) => Promise<void>): Promise<void> {
    const transaction = await this.connection.begin();
    try {
      await work(transaction);
      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
      }
      throw error;
    }
  }
}
