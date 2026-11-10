import { golden, catalogEntries } from './golden-data.js';
import { runSelfTest } from './selftest.js';

const results = runSelfTest(golden, catalogEntries);
const failed = results.filter((r) => !r.pass);
const summary = document.getElementById('summary');
summary.textContent = failed.length === 0
  ? `All ${results.length} checks passed. The JavaScript port matches the C# golden vectors.`
  : `${failed.length} of ${results.length} checks FAILED.`;
summary.className = failed.length === 0 ? 'ok' : 'bad';
const tbody = document.getElementById('rows');
for (const r of results) {
  const tr = document.createElement('tr');
  for (const text of [r.group, r.label, r.pass ? 'pass' : `FAIL ${r.detail}`]) {
    const td = document.createElement('td'); td.textContent = text; tr.appendChild(td);
  }
  tr.className = r.pass ? 'ok' : 'bad';
  tbody.appendChild(tr);
}
document.title = `${failed.length === 0 ? 'PASS' : 'FAIL'} | Self-test`;
