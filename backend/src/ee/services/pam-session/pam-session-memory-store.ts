import { logger } from "@app/lib/logger";

/**
 * Session access data stored in memory for browser-based PAM access
 * Contains certificates and credentials needed to establish relay/gateway connections
 */
export type TSessionAccessData = {
  relayHost: string;
  relayClientCert: string;
  relayClientKey: string;
  relayServerCertChain: string;
  gatewayClientCert: string;
  gatewayClientKey: string;
  gatewayServerCertChain: string;
  credentials: {
    username: string;
    password: string;
    database: string;
  };
};

/**
 * In-memory store for PAM session access data
 * Used for browser-based access to maintain certificates and credentials
 * without requiring database persistence
 */
class SessionAccessDataStore {
  private store = new Map<string, TSessionAccessData>();

  /**
   * Store session access data
   * @param sessionId - PAM session ID
   * @param data - Access data including certificates and credentials
   */
  set(sessionId: string, data: TSessionAccessData): void {
    this.store.set(sessionId, data);
    logger.info({ sessionId }, "Stored session access data in memory");
  }

  /**
   * Retrieve session access data
   * @param sessionId - PAM session ID
   * @returns Access data if found, undefined otherwise
   */
  get(sessionId: string): TSessionAccessData | undefined {
    return this.store.get(sessionId);
  }

  /**
   * Remove session access data from memory
   * Called when session expires or is terminated
   * @param sessionId - PAM session ID
   */
  delete(sessionId: string): void {
    const deleted = this.store.delete(sessionId);
    if (deleted) {
      logger.info({ sessionId }, "Deleted session access data from memory");
    }
  }

  /**
   * Check if session access data exists
   * @param sessionId - PAM session ID
   * @returns true if data exists, false otherwise
   */
  has(sessionId: string): boolean {
    return this.store.has(sessionId);
  }

  /**
   * Get all session IDs currently in memory
   * Used by cleanup job to check for expired sessions
   * @returns Iterator of session IDs
   */
  keys(): IterableIterator<string> {
    return this.store.keys();
  }

  /**
   * Get number of sessions currently in memory
   * Used for monitoring and metrics
   * @returns Count of sessions
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Clear all session data from memory
   * Used for testing or graceful shutdown
   */
  clear(): void {
    const count = this.store.size;
    this.store.clear();
    logger.warn({ count }, "Cleared all session access data from memory");
  }
}

/**
 * Singleton instance of the session access data store
 * Shared across the application
 */
export const sessionAccessDataStore = new SessionAccessDataStore();
