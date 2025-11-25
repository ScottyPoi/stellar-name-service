import {
  Operation,
  xdr,
  Address,
  Contract,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { config } from "./config";

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
