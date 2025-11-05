import { createHash } from "node:crypto";

const LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeFqdn(fqdn: string): string {
  return fqdn.trim().toLowerCase();
}

export function validateFqdn(fqdn: string): void {
  const normalized = normalizeFqdn(fqdn);
  if (!normalized || normalized.length > 255) {
    throw new Error("fqdn must be between 1 and 255 characters");
  }
  const labels = normalized.split(".");
  if (labels.length < 2) {
    throw new Error("fqdn must include at least a root and one label");
  }
  for (const label of labels) {
    if (!LABEL_REGEX.test(label)) {
      throw new Error(`invalid label "${label}" in fqdn`);
    }
  }
}

export function fqdnToNamehash(fqdn: string): Buffer {
  validateFqdn(fqdn);
  const labels = normalizeFqdn(fqdn).split(".");
  let node = Buffer.alloc(32, 0);
  for (const label of labels) {
    const labelHash = createHash("sha256")
      .update(Buffer.from(label, "utf8"))
      .digest();
    const data = Buffer.concat([node, labelHash]);
    node = createHash("sha256").update(data).digest();
  }
  return node;
}

export function bufferToHex(buffer: Buffer): string {
  return buffer.toString("hex");
}
