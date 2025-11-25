import { Networks } from "@stellar/stellar-sdk";

/**
 * Maps network names to their Horizon URLs
 */
export function getHorizonUrl(network: string | null): string {
  if (!network) {
    // Default to testnet if network is unknown
    return "https://horizon-testnet.stellar.org";
  }

  const networkUpper = network.toUpperCase();

  switch (networkUpper) {
    case "TESTNET":
      return "https://horizon-testnet.stellar.org";
    case "PUBLIC":
    case "MAINNET":
      return "https://horizon.stellar.org";
    case "FUTURENET":
      return "https://horizon-futurenet.stellar.org";
    case "STANDALONE":
      // Standalone sandbox typically runs on localhost:8000
      return "http://localhost:8000";
    default:
      // For custom networks, try to infer from common patterns
      // If it's a local network, assume localhost:8000
      if (networkUpper.includes("STANDALONE") || networkUpper.includes("LOCAL")) {
        return "http://localhost:8000";
      }
      // Default to testnet for unknown networks
      return "https://horizon-testnet.stellar.org";
  }
}

/**
 * Gets the network passphrase constant from Stellar SDK, or returns the provided passphrase
 */
export function getNetworkPassphrase(
  network: string | null,
  providedPassphrase: string | null
): string {
  // If we have a provided passphrase, use it (for custom networks)
  if (providedPassphrase) {
    return providedPassphrase;
  }

  if (!network) {
    return Networks.TESTNET;
  }

  const networkUpper = network.toUpperCase();

  switch (networkUpper) {
    case "TESTNET":
      return Networks.TESTNET;
    case "PUBLIC":
    case "MAINNET":
      return Networks.PUBLIC;
    case "FUTURENET":
      return Networks.FUTURENET;
    case "STANDALONE":
      return Networks.STANDALONE;
    default:
      // For unknown networks, try to use provided passphrase or default to TESTNET
      return Networks.TESTNET;
  }
}

/**
 * Gets a display name for the network
 */
export function getNetworkDisplayName(network: string | null): string {
  if (!network) {
    return "Unknown";
  }

  const networkUpper = network.toUpperCase();

  switch (networkUpper) {
    case "TESTNET":
      return "Testnet";
    case "PUBLIC":
    case "MAINNET":
      return "Mainnet";
    case "FUTURENET":
      return "Futurenet";
    case "STANDALONE":
      return "Standalone";
    default:
      return network;
  }
}

