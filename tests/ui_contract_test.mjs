import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const index = await readFile(path.join(projectRoot, 'index.html'), 'utf8');

const contracts = [
  ['desktop drawer fits content', '.drawer { position: absolute; top: 50%;'],
  ['desktop drawer has a bounded height', 'max-height: calc(100% - 40px);'],
  ['desktop body does not grow into blank space', '.drawer-body { flex: 0 1 auto;'],
  ['last detail block has no extra margin', '.detail-block:last-child { margin-bottom: 0; }'],
  ['original content uses the outer scroll area', '#drawer-body { max-height: none; overflow: visible; }'],
  ['mobile body fills available viewport', '.drawer-body { flex: 1 1 auto; min-height: 0; max-height: none;'],
  ['long code wraps on small screens', 'overflow-wrap: anywhere; word-break: break-word;'],
];

for (const [name, contract] of contracts) {
  assert.ok(index.includes(contract), `${name}: missing ${contract}`);
}

console.log(JSON.stringify({ uiLayoutContracts: contracts.length, status: 'passed' }));
