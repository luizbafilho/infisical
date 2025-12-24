import tls from "tls";

import { logger } from "@app/lib/logger";

export type TRelayConnectionConfig = {
  relayHost: string;
  relayClientCert: string;
  relayClientKey: string;
  relayServerCertChain: string;
};

/**
 * Create a TLS connection to the PAM relay server
 * The relay acts as a proxy to the gateway, providing network isolation
 *
 * Connection flow: Backend → Relay (TLS) → Gateway (mTLS over relay)
 *
 * @param config - Relay connection configuration including host and certificates
 * @returns TLS socket connected to relay server
 * @throws Error if connection fails or TLS handshake fails
 */
export const createRelayConnection = async (config: TRelayConnectionConfig): Promise<tls.TLSSocket> => {
  const { relayHost, relayClientCert, relayClientKey, relayServerCertChain } = config;

  // Parse host and port from relayHost (format: "host:port" or just "host")
  let host: string;
  let port = 8443; // Default port

  if (relayHost.includes(":")) {
    const parts = relayHost.split(":");
    host = parts[0];
    const parsedPort = parseInt(parts[1], 10);
    if (Number.isNaN(parsedPort)) {
      throw new Error(`Invalid port in relay host: ${relayHost}`);
    }
    port = parsedPort;
  } else {
    host = relayHost;
  }

  logger.debug({ host, port }, "Creating relay TLS connection");

  // Create TLS connection with client certificates
  const relayConn = tls.connect({
    host,
    port,
    cert: Buffer.from(relayClientCert),
    key: Buffer.from(relayClientKey),
    ca: Buffer.from(relayServerCertChain),
    servername: host, // SNI for TLS
    minVersion: "TLSv1.2" as const,
    // Reject unauthorized certificates (strict security)
    rejectUnauthorized: true
  });

  // Wait for TLS handshake to complete
  await new Promise<void>((resolve, reject) => {
    relayConn.once("secureConnect", () => {
      // Verify the connection is authorized
      if (!relayConn.authorized) {
        const authError = relayConn.authorizationError;
        reject(new Error(`Relay TLS connection not authorized: ${authError?.message || "Unknown error"}`));
        return;
      }

      logger.info(
        {
          host,
          port,
          protocol: relayConn.getProtocol(),
          cipher: relayConn.getCipher()?.name
        },
        "Relay TLS connection established"
      );
      resolve();
    });

    relayConn.once("error", (error) => {
      logger.error({ host, port, error }, "Relay TLS connection error");
      reject(new Error(`Failed to connect to relay: ${error.message}`));
    });

    // Timeout after 10 seconds
    relayConn.setTimeout(10000, () => {
      relayConn.destroy();
      reject(new Error(`Relay connection timeout after 10 seconds (${host}:${port})`));
    });
  });

  // Clear timeout after successful connection
  relayConn.setTimeout(0);

  return relayConn;
};
