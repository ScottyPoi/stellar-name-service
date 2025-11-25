function coerceBuffer(value: unknown, label: string): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  throw new Error(`unable to coerce ${label} to Buffer`);
}

function coerceString(value: unknown, label: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Buffer || value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  throw new Error(`unable to coerce ${label} to string`);
}

function coerceNumber(value: unknown, label: string): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  throw new Error(`unable to coerce ${label} to number`);
}


export interface NormalizedEvent {
  contractId: string;
  txId: string;
  eventIndex: number;
  timestamp: number;
  type: string;
  namehash: Buffer;
  data: Record<string, unknown>;
  cursor?: string;
  raw?: unknown;
}

export type Mutation =
  | { kind: "ensureName"; namehash: Buffer; fqdn: string; contractId?: string }
  | { kind: "setResolver"; namehash: Buffer; resolver: string; contractId?: string }
  | {
      kind: "setOwner";
      namehash: Buffer;
      owner: string;
      source?: "registry" | "resolver";
      contractId?: string;
    }
  | { kind: "setExpiry"; namehash: Buffer; expiresAt: number; contractId?: string }
  | { kind: "setRecord"; namehash: Buffer; key: Buffer; value: Buffer; contractId?: string }
  | { kind: "deleteRecord"; namehash: Buffer; key: Buffer; contractId?: string }
  | {
      kind: "registrarRegistration";
      namehash: Buffer;
      owner: string;
      expiresAt: number;
      txId: string;
      contractId?: string;
    }
  | { kind: "registrarRenewal"; namehash: Buffer; expiresAt: number; contractId?: string };


export function extractMutations(event: NormalizedEvent, tld?: string, registryId?: string): Mutation[] {
  const { type, namehash, data, txId, contractId } = event;
  const mutations: Mutation[] = [];
  const isRegistryEvent = contractId === registryId;

  if (typeof data.fqdn === "string") {
    mutations.push({
      kind: "ensureName",
      namehash,
      fqdn: data.fqdn,
      contractId
    });
  }

  switch (type) {
    case "resolver_changed": {
      const resolver = coerceString(data.resolver, "resolver");
      mutations.push({ kind: "setResolver", namehash, resolver, contractId });
      break;
    }
    case "renew": {
      const expiresAt = coerceNumber(data.expires_at ?? data.expiresAt, "expires_at");
      mutations.push({ kind: "setExpiry", namehash, expiresAt, contractId });
      break;
    }
    case "transfer": {
      const owner = coerceString(data.to ?? data.owner ?? data.new_owner, "owner");
      mutations.push({ kind: "setOwner", namehash, owner, source: "registry", contractId: isRegistryEvent ? contractId : undefined });
      break;
    }
    case "address_changed": {
      const address = coerceString(data.addr ?? data.address, "addr");
      const addrKey = Buffer.from("addr", "utf8");
      mutations.push({
        kind: "setOwner",
        namehash,
        owner: address,
        source: "resolver",
        contractId
      });
      mutations.push({
        kind: "setRecord",
        namehash,
        key: addrKey,
        value: Buffer.from(address, "utf8"),
        contractId
      });
      break;
    }
    case "name_registered": {
      const owner = coerceString(data.owner, "owner");
      const expiresAt = coerceNumber(
        data.expires_at ?? data.expiresAt,
        "expires_at"
      );
      
      // Extract label from event data and construct FQDN
      if (data.label !== undefined && tld) {
        const label = coerceString(data.label, "label");
        const fqdn = `${label}.${tld}`;
        mutations.push({
          kind: "ensureName",
          namehash,
          fqdn,
          contractId
        });
      }
      
      mutations.push({
        kind: "registrarRegistration",
        namehash,
        owner,
        expiresAt,
        txId,
        contractId
      });
      break;
    }
    case "name_renewed": {
      const expiresAt = coerceNumber(
        data.expires_at ?? data.expiresAt,
        "expires_at"
      );
      mutations.push({ kind: "registrarRenewal", namehash, expiresAt, contractId });
      break;
    }
    case "commit_made": {
      // Registrar commitment events are not persisted.
      break;
    }
    case "text_changed": {
      const key = coerceBuffer(data.key, "key");
      if (data.value === undefined && data.text === undefined) {
        // Ingestion should backfill the value (requires contract read).
        break;
      }
      const value = coerceBuffer(data.value ?? data.text, "value");
      mutations.push({ kind: "setRecord", namehash, key, value, contractId });
      break;
    }
    default:
      // Unknown event types are ignored.
      break;
  }

  return mutations;
}
