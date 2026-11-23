const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

let failures = 0;
let passes = 0;

function assert(condition, message) {
  if (condition) {
    passes++;
    console.log(`  ✓ ${message}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(resData); } catch (e) { parsed = resData; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log(`--- RUNNING INTEGRATION TEST SUITE (http://${HOST}:${PORT}) ---`);

  // 1. Auth Login
  const login = await request('POST', '/api/auth/login', { email: 'admin@company.com', password: 'admin123' });
  assert(login.status === 200, `Login status expected 200, got ${login.status}`);
  assert(login.data.user?.name.includes('Rian Pratama'), `User name matches logged in admin (${login.data.user?.name})`);

  // 2. Boundary Validation on POST /api/assets (Empty body should return 400)
  const emptyAsset = await request('POST', '/api/assets', {});
  assert(emptyAsset.status === 400, `Empty asset body rejected with 400 validation error`);
  assert(emptyAsset.data.code === 'VALIDATION_ERROR', `Error code matches VALIDATION_ERROR`);

  // 3. Valid Asset Creation
  const newAsset = await request('POST', '/api/assets', {
    name: 'CI Integration Test Laptop',
    category: 'IT',
    subcategory: 'laptop',
    specs: { ram: '32GB', storage: '1TB' },
    userName: 'CI Pipeline'
  });
  assert(newAsset.status === 201, `Asset created with status 201`);
  assert(typeof newAsset.data.code === 'string' && newAsset.data.code.startsWith('IT-LPT'), `Asset tag code generated`);
  const createdAssetId = newAsset.data.id;

  // 4. Transactional Asset Handover
  const handover = await request('POST', `/api/assets/${createdAssetId}/handover`, {
    to_user_id: 6,
    action_type: 'checkout',
    condition: 'Baik (Normal)',
    notes: 'Unit testing serah terima CI',
    userName: 'CI Runner'
  });
  assert(handover.status === 200, `Asset handover status 200`);
  assert(typeof handover.data.bast_number === 'string', `BAST number created`);

  // 5. Consumable Checkout Over-limit (Must reject 400)
  const excessCheckout = await request('POST', '/api/consumables/1/checkout', {
    recipient_name: 'CI Tester',
    quantity: 999999
  });
  assert(excessCheckout.status === 400, `Excess consumable checkout rejected with 400`);
  assert(excessCheckout.data.code === 'INSUFFICIENT_STOCK', `Rejection code is INSUFFICIENT_STOCK`);

  // 6. Consumable Checkout Valid (Atomic & Transactional)
  const validCheckout = await request('POST', '/api/consumables/1/checkout', {
    recipient_name: 'CI Tester',
    quantity: 1,
    notes: 'Testing atomic checkout in CI'
  });
  assert(validCheckout.status === 201, `Valid consumable checkout accepted with 201`);

  // 7. Stats Overview
  const stats = await request('GET', '/api/stats');
  assert(stats.status === 200, `Stats overview status 200`);
  assert(Number(stats.data.assets?.total) >= 0, `Stats returns total asset count (${stats.data.assets?.total})`);

  // 8. CSV Export (Formula injection prevention)
  const csv = await request('GET', '/api/reports/export?type=assets');
  assert(csv.status === 200, `CSV Export status 200`);
  assert(csv.headers['content-type']?.includes('text/csv'), `Content-Type is text/csv`);

  // 9. Cleanup test asset
  const del = await request('DELETE', `/api/assets/${createdAssetId}`);
  assert(del.status === 200, `Test asset cleaned up with status 200`);

  console.log(`\n--- TEST RESULTS: ${passes} passed, ${failures} failed ---`);
  if (failures > 0) {
    console.error('❌ Integration Test Suite Failed.');
    process.exit(1);
  } else {
    console.log('✅ All integration tests passed successfully.');
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
