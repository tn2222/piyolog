export type DatabaseConnection = {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

export type DatabaseTransactionConnection = DatabaseConnection & {
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
};

export type TransactionalDatabaseConnection = {
  begin(): Promise<DatabaseTransactionConnection>;
};
