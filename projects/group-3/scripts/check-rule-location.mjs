// Feedback check: the hard rule must live ONLY in src/domain. Clients must not re-implement it.
import fs from 'node:fs';
import path from 'node:path';
const bad = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk('src').filter((f) => f.endsWith('.js') && !f.includes(`${path.sep}domain${path.sep}`))) {
  const t = fs.readFileSync(f, 'utf8');
  if (/budget_cap|\.cap\b|total_after|OVER_BUDGET\s*=/.test(t) && !/\/\/ allow-cap/.test(t)) bad.push(f);
}
if (bad.length) {
  console.error('ERROR  budget logic found outside src/domain:\n  ' + bad.join('\n  '));
  console.error('WHY    the rule must have one home so every client obeys it');
  console.error('FIX    move the logic into src/domain/budget.js and call it through store.js');
  process.exit(1);
}
console.log('rule-location check: OK');
