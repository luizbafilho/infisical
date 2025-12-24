import tls from "tls";

import { logger } from "@app/lib/logger";

export type TGatewayConnectionConfig = {
  gatewayClientCert: string;
  gatewayClientKey: string;
  gatewayServerCertChain: string;
};

/**
 * ALPN protocol for PAM database proxy
 * Used to negotiate the application protocol with the gateway
 */
export const ALPN_PAM_PROXY = "infisical-pam-proxy";

/**
 * Create a mTLS connection to the PAM gateway over an existing relay connection
 * The gateway intercepts database wire protocol and injects credentials
 *
 * Connection flow: Backend → Relay (TLS) → Gateway (mTLS) → Database
 *
 * @param relayConn - Established TLS connection to relay server
 * @param config - Gateway connection configuration including certificates
 * @returns TLS socket connected to gateway server over relay
 * @throws Error if connection fails or mTLS handshake fails
 */
export const createGatewayConnection = async (
  relayConn: tls.TLSSocket,
  config: TGatewayConnectionConfig
): Promise<tls.TLSSocket> => {
  const { gatewayClientCert, gatewayClientKey, gatewayServerCertChain } = config;

  logger.debug("Creating gateway mTLS connection over relay");

  // Create mTLS connection using the relay connection as the underlying socket
  const gatewayConn = tls.connect({
    socket: relayConn, // Use relay connection as transport
    cert: Buffer.from(gatewayClientCert),
    key: Buffer.from(gatewayClientKey),
    ca: Buffer.from(gatewayServerCertChain),
    // ALPN negotiation - tells gateway we want to use the PAM proxy protocol
    ALPNProtocols: [ALPN_PAM_PROXY],
    // SNI for gateway (localhost since it's over the relay)
    servername: "localhost",
    minVersion: "TLSv1.2" as const,
    maxVersion: "TLSv1.3" as const,
    // Reject unauthorized certificates (strict security)
    rejectUnauthorized: true
  });

  // Wait for mTLS handshake to complete
  await new Promise<void>((resolve, reject) => {
    gatewayConn.once("secureConnect", () => {
      // Verify the connection is authorized
      if (!gatewayConn.authorized) {
        const authError = gatewayConn.authorizationError;
        reject(new Error(`Gateway mTLS connection not authorized: ${authError?.message || "Unknown error"}`));
        return;
      }

      // Verify ALPN protocol was negotiated
      const alpnProtocol = gatewayConn.alpnProtocol;
      if (alpnProtocol !== ALPN_PAM_PROXY) {
        reject(
          new Error(`Gateway ALPN protocol mismatch: expected '${ALPN_PAM_PROXY}', got '${alpnProtocol || "none"}'`)
        );
        return;
      }

      logger.info(
        {
          protocol: gatewayConn.getProtocol(),
          cipher: gatewayConn.getCipher()?.name,
          alpn: alpnProtocol
        },
        "Gateway mTLS connection established"
      );
      resolve();
    });

    gatewayConn.once("error", (error) => {
      logger.error({ error }, "Gateway mTLS connection error");
      reject(new Error(`Failed to connect to gateway: ${error.message}`));
    });

    // Timeout after 10 seconds
    gatewayConn.setTimeout(10000, () => {
      gatewayConn.destroy();
      reject(new Error("Gateway mTLS connection timeout after 10 seconds"));
    });
  });

  // Clear timeout after successful connection
  gatewayConn.setTimeout(0);

  return gatewayConn;
};
