const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let hasError = false;
let checkedCount = 0;

function checkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') {
        checkDir(full);
      }
    } else if (f.endsWith('.js') || f.endsWith('.cjs')) {
      checkedCount++;
      try {
        execSync(`node --check "${full}"`, { stdio: 'pipe' });
      } catch (err) {
        console.error(`[SYNTAX ERROR] in ${full}:\n`, err.stderr?.toString() || err.message);
        hasError = true;
      }
    }
  }
}

console.log('--- RUNNING JAVASCRIPT SYNTAX CHECK GATE ---');
checkDir('src');
checkDir('tests');
checkDir('scripts');

console.log(`Checked ${checkedCount} JavaScript files.`);

if (hasError) {
  console.error('❌ Quality Gate Failed: Syntax errors detected.');
  process.exit(1);
} else {
  console.log('✅ Quality Gate Passed: All JavaScript files passed syntax verification.');
}
