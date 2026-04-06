import { InMemoryLocalPersistence } from "./inMemoryLocalPersistence";
import { InMemorySyncAdapter } from "./inMemorySyncAdapter";
import { LocalCatalogRepository } from "./localCatalogRepository";
import { mockCatalogSnapshot } from "./mockData";

export class MockCatalogRepository extends LocalCatalogRepository {
  constructor() {
    super(new InMemoryLocalPersistence(mockCatalogSnapshot), new InMemorySyncAdapter());
  }
}
