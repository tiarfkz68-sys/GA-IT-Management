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

// Also validate inline <script> blocks in public/index.html
const indexPath = path.join('public', 'index.html');
if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  scripts.forEach((tag, idx) => {
    const code = tag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    if (!code) return;
    checkedCount++;
    try {
      new Function(code);
    } catch (err) {
      console.error(`[SYNTAX ERROR] in ${indexPath} inline <script> #${idx + 1}:\n`, err.message);
      hasError = true;
    }
  });
}

console.log(`Checked ${checkedCount} JavaScript files / inline scripts.`);

if (hasError) {
  console.error('❌ Quality Gate Failed: Syntax errors detected.');
  process.exit(1);
} else {
  console.log('✅ Quality Gate Passed: All JavaScript files passed syntax verification.');
}
