import type {
  RemoteSyncAdapter,
  SyncPullRequest,
  SyncPullResult,
  SyncPushRequest,
  SyncPushResult
} from "./sync";

export interface SupabaseSyncConfig {
  url: string;
  anonKey: string;
  schema?: string;
}

export class SupabaseSyncAdapter implements RemoteSyncAdapter {
  readonly mode = "remote-ready" as const;
  readonly #config: SupabaseSyncConfig;

  constructor(config: SupabaseSyncConfig) {
    this.#config = config;
  }

  async pushChanges(_request: SyncPushRequest): Promise<SyncPushResult> {
    void this.#config;
    return {
      acceptedOperationIds: [],
      rejected: [],
      remoteCursor: null
    };
  }

  async pullChanges(_request: SyncPullRequest): Promise<SyncPullResult> {
    void this.#config;
    return {
      changes: [],
      remoteCursor: null
    };
  }
}

export function createRemoteSyncAdapter(config?: SupabaseSyncConfig | null): RemoteSyncAdapter | null {
  if (!config?.url || !config.anonKey) {
    return null;
  }

  return new SupabaseSyncAdapter(config);
}
