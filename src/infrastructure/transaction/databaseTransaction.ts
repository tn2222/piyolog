import type { DatabaseTransactionInterface } from "../../application/databaseTransaction";
import type { DatabaseConnection, TransactionalDatabaseConnection } from "../databaseConnection";

export interface DatabaseGatewayInterface<TRepository> {
  new (connection: DatabaseConnection): TRepository;
}

export class DatabaseTransaction<TRepository>
  implements DatabaseTransactionInterface<TRepository> {
  constructor(
    private readonly connection: TransactionalDatabaseConnection,
    private readonly Repository: DatabaseGatewayInterface<TRepository>,
  ) {}

  async run(work: (repository: TRepository) => Promise<void>): Promise<void> {
    const transaction = await this.connection.begin();
    try {
      await work(new this.Repository(transaction));
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
