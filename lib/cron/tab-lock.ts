const DEFAULT_TTL_MS = 60_000;

class TabLockManager {
  private locks = new Map<string, number>();

  acquire(persistentId: string, ttlMs = DEFAULT_TTL_MS): boolean {
    const now = Date.now();
    const until = this.locks.get(persistentId);
    if (until !== undefined && until > now) return false;
    this.locks.set(persistentId, now + ttlMs);
    return true;
  }

  release(persistentId: string): void {
    this.locks.delete(persistentId);
  }

  isLocked(persistentId: string): boolean {
    const until = this.locks.get(persistentId);
    if (until === undefined) return false;
    if (until <= Date.now()) {
      this.locks.delete(persistentId);
      return false;
    }
    return true;
  }
}

export const tabLockManager = new TabLockManager();
