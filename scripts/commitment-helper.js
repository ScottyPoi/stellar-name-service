#!/usr/bin/env node
/**
 * commitment-helper.js
 * Compute Registrar commitment as implemented on-chain:
 * sha256( label_bytes || xdr(Address(owner)) || secret_bytes )
 *
 * Usage:
 *   node commitment-helper.js --label alice --owner G... --secret-hex <64 hex chars>
 *
 * Prints the 32-byte commitment as lowercase hex (no 0x prefix).
 */
const { xdr, StrKey } = require('@stellar/stellar-base');
const crypto = require('crypto');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    out[k.replace(/^--/, '')] = v;
  }
  return out;
}

function scAddressAccountFromG(gaddr) {
  if (!StrKey.isValidEd25519PublicKey(gaddr)) {
    throw new Error('Invalid G-address');
  }
  const raw = StrKey.decodeEd25519PublicKey(gaddr); // Buffer(32)
  // XDR types:
  //   PublicKey = PublicKeyType + ed25519(opaque[32])
  //   AccountId = PublicKey
  //   ScAddress = scAddressType=SC_ADDRESS_TYPE_ACCOUNT + accountId
  const accountId = xdr.AccountId.publicKeyTypeEd25519(raw);
  return xdr.ScAddress.scAddressTypeAccount(accountId);
}

function main() {
  const args = parseArgs(process.argv);
  const labelHex = args['label-hex'];
  const label = args.label || '';
  const owner = args.owner;
  const secretHex = args['secret-hex'];

  if (!label && !labelHex) throw new Error('--label or --label-hex is required');
  if (!owner) throw new Error('--owner is required (G...)');
  if (!secretHex) throw new Error('--secret-hex is required (64 hex chars)');

  const labelBytes = labelHex
    ? Buffer.from(labelHex, 'hex')
    : Buffer.from(label, 'utf8');
  const secretBytes = Buffer.from(secretHex, 'hex');
  if (secretBytes.length !== 32) {
    throw new Error('secret-hex must be 32 bytes (64 hex chars)');
  }

  const scAddr = scAddressAccountFromG(owner);
  // Contract uses Address::to_xdr => ScVal(Address)
  const scAddrXdr = xdr.ScVal.scvAddress(scAddr).toXDR(); // Buffer

  const buf = Buffer.concat([labelBytes, scAddrXdr, secretBytes]);
  const commitment = crypto.createHash('sha256').update(buf).digest('hex');
  process.stdout.write(commitment.toLowerCase());
}

if (require.main === module) {
  main();
}
