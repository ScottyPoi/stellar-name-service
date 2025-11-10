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
  | { kind: "ensureName"; namehash: Buffer; fqdn: string }
  | { kind: "setResolver"; namehash: Buffer; resolver: string }
  | {
      kind: "setOwner";
      namehash: Buffer;
      owner: string;
      source?: "registry" | "resolver";
    }
  | { kind: "setExpiry"; namehash: Buffer; expiresAt: number }
  | { kind: "setRecord"; namehash: Buffer; key: Buffer; value: Buffer }
  | { kind: "deleteRecord"; namehash: Buffer; key: Buffer }
  | {
      kind: "registrarRegistration";
      namehash: Buffer;
      owner: string;
      expiresAt: number;
      txId: string;
    }
  | { kind: "registrarRenewal"; namehash: Buffer; expiresAt: number };


export function extractMutations(event: NormalizedEvent): Mutation[] {
  const { type, namehash, data, txId } = event;
  const mutations: Mutation[] = [];

  if (typeof data.fqdn === "string") {
    mutations.push({
      kind: "ensureName",
      namehash,
      fqdn: data.fqdn
    });
  }

  switch (type) {
    case "resolver_changed": {
      const resolver = coerceString(data.resolver, "resolver");
      mutations.push({ kind: "setResolver", namehash, resolver });
      break;
    }
    case "renew": {
      const expiresAt = coerceNumber(data.expires_at ?? data.expiresAt, "expires_at");
      mutations.push({ kind: "setExpiry", namehash, expiresAt });
      break;
    }
    case "transfer": {
      const owner = coerceString(data.to ?? data.owner ?? data.new_owner, "owner");
      mutations.push({ kind: "setOwner", namehash, owner, source: "registry" });
      break;
    }
    case "address_changed": {
      const address = coerceString(data.addr ?? data.address, "addr");
      const addrKey = Buffer.from("addr", "utf8");
      mutations.push({
        kind: "setOwner",
        namehash,
        owner: address,
        source: "resolver"
      });
      mutations.push({
        kind: "setRecord",
        namehash,
        key: addrKey,
        value: Buffer.from(address, "utf8")
      });
      break;
    }
    case "name_registered": {
      const owner = coerceString(data.owner, "owner");
      const expiresAt = coerceNumber(
        data.expires_at ?? data.expiresAt,
        "expires_at"
      );
      mutations.push({
        kind: "registrarRegistration",
        namehash,
        owner,
        expiresAt,
        txId
      });
      break;
    }
    case "name_renewed": {
      const expiresAt = coerceNumber(
        data.expires_at ?? data.expiresAt,
        "expires_at"
      );
      mutations.push({ kind: "registrarRenewal", namehash, expiresAt });
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
      mutations.push({ kind: "setRecord", namehash, key, value });
      break;
    }
    default:
      // Unknown event types are ignored.
      break;
  }

  return mutations;
}
