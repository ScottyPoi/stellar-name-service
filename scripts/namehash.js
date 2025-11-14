// namehash.js
import crypto from 'node:crypto';

function labelhash(label) {
  return crypto.createHash('sha256').update(Buffer.from(label, 'utf8')).digest();
}
function namehash(labels) {
  let node = Buffer.alloc(32, 0); // root
  for (const l of labels) {
    node = crypto.createHash('sha256').update(Buffer.concat([node, labelhash(l)])).digest();
  }
  return node.toString('hex');
}

console.log(namehash(process.argv.slice(2)));
