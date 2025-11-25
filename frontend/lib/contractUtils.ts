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

export function generateSecretBytes(): Uint8Array {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error("Secure random generation unavailable in this environment.");
  }
  const secret = new Uint8Array(32);
  webCrypto.getRandomValues(secret);
  return secret;
}

export async function computeCommitmentHex(
  label: string,
  ownerAccount: string,
  secret: Uint8Array
): Promise<string> {
  if (secret.length !== 32) {
    throw new Error("Secret must be 32 bytes");
  }
  const labelBytes = new TextEncoder().encode(label);
  const ownerVal = Address.fromString(ownerAccount).toScVal();
  const ownerXdr = ownerVal.toXDR();

  const preimage = new Uint8Array(labelBytes.length + ownerXdr.length + secret.length);
  preimage.set(labelBytes, 0);
  preimage.set(ownerXdr, labelBytes.length);
  preimage.set(secret, labelBytes.length + ownerXdr.length);

  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) {
    throw new Error("SHA-256 is unavailable (missing WebCrypto.subtle).");
  }
  const digest = await webCrypto.subtle.digest(
    "SHA-256",
    preimage.buffer.slice(
      preimage.byteOffset,
      preimage.byteOffset + preimage.byteLength
    )
  );
  return bytesToHex(new Uint8Array(digest));
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
 * Creates a commit operation for the registrar using the precomputed commitment hex and label length.
 */
export function createCommitOperation(
  registrarContractId: string,
  callerAccount: string,
  commitmentHex: string,
  labelLength: number
): xdr.Operation<Operation.InvokeHostFunction> {
  const contract = new Contract(registrarContractId);
  const caller = Address.fromString(callerAccount);
  const commitmentBytes = hexToBytes(commitmentHex);
  if (commitmentBytes.length !== 32) {
    throw new Error("Commitment must be 32 bytes (64 hex chars)");
  }
  return contract.call(
    "commit",
    caller.toScVal(),
    nativeToScVal(commitmentBytes),
    xdr.ScVal.scvU32(labelLength)
  );
}

/**
 * Creates a register operation for the registrar using the provided label, owner, and secret hex.
 * Pass `resolverAddress` as null or undefined to skip setting a resolver during registration.
 */
export function createRegisterOperation(
  registrarContractId: string,
  callerAccount: string,
  label: string,
  ownerAccount: string,
  secretHex: string,
  resolverAddress?: string | null
): xdr.Operation<Operation.InvokeHostFunction> {
  const contract = new Contract(registrarContractId);
  const caller = Address.fromString(callerAccount);
  const owner = Address.fromString(ownerAccount);
  const labelBytes = new TextEncoder().encode(label);
  const secretBytes = hexToBytes(secretHex);
  if (secretBytes.length !== 32) {
    throw new Error("Secret must be 32 bytes (64 hex chars)");
  }

  const resolverVal =
    resolverAddress && resolverAddress.trim().length > 0
      ? Address.fromString(resolverAddress.trim()).toScVal()
      : xdr.ScVal.scvVoid();

  return contract.call(
    "register",
    caller.toScVal(),
    nativeToScVal(labelBytes),
    owner.toScVal(),
    nativeToScVal(secretBytes),
    resolverVal
  );
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
