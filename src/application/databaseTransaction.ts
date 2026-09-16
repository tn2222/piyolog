export interface DatabaseTransactionInterface<TRepository> {
  run(work: (repository: TRepository) => Promise<void>): Promise<void>;
}
