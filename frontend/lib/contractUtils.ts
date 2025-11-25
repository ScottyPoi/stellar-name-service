import {
  Operation,
  xdr,
  Address,
  Contract,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { config } from "./config";

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Hex value must be even-length and contain only 0-9a-f");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates a contract invocation operation for renewing a name through the registrar.
 * The registrar renew function expects the caller address and the plain-text label bytes.
 */
export function createRenewOperation(
  registrarContractId: string,
  callerAccount: string,
  label: string
): xdr.Operation<Operation.InvokeHostFunction> {
  const contract = new Contract(registrarContractId);
  const caller = Address.fromString(callerAccount);
  const labelBytes = new TextEncoder().encode(label);
  return contract.call("renew", caller.toScVal(), nativeToScVal(labelBytes));
}

/**
 * Creates a contract invocation operation for transferring ownership of a name
 * via the registry contract.
 */
export function createTransferOperation(
  registryContractId: string,
  namehashHex: string,
  newOwnerAccount: string
): xdr.Operation<Operation.InvokeHostFunction> {
  const contract = new Contract(registryContractId);
  const namehashBytes = Buffer.from(namehashHex, "hex");
  if (namehashBytes.length !== 32) {
    throw new Error("Invalid namehash length; expected 32 bytes");
  }
  const namehashVal = nativeToScVal(new Uint8Array(namehashBytes));
  const newOwner = Address.fromString(newOwnerAccount);
  return contract.call("transfer", namehashVal, newOwner.toScVal());
}

/**
 * Gets the RPC URL for the current network
 */
export function getRpcUrl(network: string | null): string {
  if (!network) {
    return config.rpcUrl;
  }

  const networkUpper = network.toUpperCase();
  
  switch (networkUpper) {
    case "TESTNET":
      return "https://soroban-testnet.stellar.org";
    case "PUBLIC":
    case "MAINNET":
      return "https://soroban-rpc.mainnet.stellar.org";
    case "FUTURENET":
      return "https://rpc-futurenet.stellar.org";
    case "STANDALONE":
      return "http://localhost:8000/soroban/rpc";
    default:
      return config.rpcUrl;
  }
}
