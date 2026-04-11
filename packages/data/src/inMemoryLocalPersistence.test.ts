import { InMemoryLocalPersistence } from "./inMemoryLocalPersistence";
import { describeLocalPersistenceContract } from "./localPersistenceContract";

describeLocalPersistenceContract("InMemoryLocalPersistence", async (seed) => {
  return new InMemoryLocalPersistence(seed);
});
