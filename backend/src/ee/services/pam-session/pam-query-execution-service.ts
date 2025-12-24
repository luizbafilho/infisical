import tls from "tls";

import postgres from "postgres";

import { logger } from "@app/lib/logger";

export type TQueryCredentials = {
  username: string;
  password: string;
  database: string;
};

export type TQueryOptions = {
  maxRows?: number;
  timeout?: number;
};

export type TQueryResult = {
  rows: unknown[];
  rowCount: number;
  fields: Array<{
    name: string;
    dataType: number;
  }>;
  executionTime: number;
};

/**
 * Execute a SQL query through the PAM gateway connection
 * The gateway intercepts the Postgres wire protocol and injects credentials
 *
 * Flow: postgres client → gateway (over mTLS) → gateway injects credentials → database
 *
 * @param gatewayConn - Established mTLS connection to gateway
 * @param query - SQL query to execute
 * @param credentials - Database credentials (injected by gateway during auth)
 * @param options - Query execution options (row limit, timeout)
 * @returns Query results with rows, metadata, and execution time
 * @throws Error if query execution fails or times out
 */
export const executeQueryThroughGateway = async (
  gatewayConn: tls.TLSSocket,
  query: string,
  credentials: TQueryCredentials,
  options: TQueryOptions = {}
): Promise<TQueryResult> => {
  const { maxRows = 1000, timeout = 30000 } = options;
  const { username, password, database } = credentials;

  logger.info(
    {
      database,
      username,
      queryLength: query.length,
      maxRows,
      timeout
    },
    "Executing query through gateway"
  );

  // Create PostgreSQL client using the gateway connection as the transport
  // The postgres library will speak Postgres wire protocol over the gateway connection
  const sql = postgres({
    socket: () => gatewayConn, // Use gateway connection as transport
    database,
    username,
    password,
    // SSL is already handled by the gateway mTLS connection
    ssl: false,
    // Statement timeout in seconds (convert from milliseconds)
    max_lifetime: Math.ceil(timeout / 1000),
    idle_timeout: Math.ceil(timeout / 1000),
    // Single connection (no pooling for proxied connections)
    max: 1,
    // Don't transform data automatically
    transform: {
      undefined: null
    }
  } as any); // Type assertion needed as socket option signature isn't fully typed

  try {
    logger.info("PostgreSQL client connected through gateway");

    // Execute query and measure execution time
    const startTime = Date.now();
    const result = await sql.unsafe(query);
    const executionTime = Date.now() - startTime;

    // Get column information from the result
    const columns = result.columns || [];
    const rowCount = result.count ?? result.length;

    logger.info(
      {
        database,
        rowCount,
        executionTime,
        fieldCount: columns.length
      },
      "Query executed successfully"
    );

    // Format and return results
    return {
      rows: result.slice(0, maxRows), // Limit rows to prevent memory issues
      rowCount,
      fields: columns.map((column) => ({
        name: column.name,
        dataType: column.type
      })),
      executionTime
    };
  } catch (error) {
    logger.error(
      {
        database,
        error: error instanceof Error ? error.message : String(error),
        queryPreview: query.substring(0, 100)
      },
      "Query execution failed"
    );

    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
    throw new Error(`Query execution failed: ${String(error)}`);
  } finally {
    // Always close the client to clean up resources
    // This doesn't close the gateway connection, just the postgres client
    try {
      await sql.end({ timeout: 5 });
      logger.debug("PostgreSQL client disconnected");
    } catch (endError) {
      logger.warn({ error: endError }, "Failed to cleanly disconnect PostgreSQL client");
    }
  }
};
