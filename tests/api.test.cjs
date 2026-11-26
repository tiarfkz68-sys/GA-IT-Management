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

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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

  const authToken = login.data.token;

  // 10. Master Lokasi API
  const locList = await request('GET', '/api/locations');
  assert(locList.status === 200, `GET /api/locations status 200`);
  assert(Array.isArray(locList.data) && locList.data.length >= 4, `Locations list returned at least 4 seeded items (${locList.data.length})`);
  const testLocName = `Test Branch Office ${Date.now().toString().slice(-4)}`;
  const createLoc = await request('POST', '/api/locations', {
    name: testLocName,
    building_floor: 'Lt 5 Gedung Baru',
    description: 'Unit testing location creation'
  }, authToken);
  assert(createLoc.status === 201, `POST /api/locations status 201`);
  assert(createLoc.data.name === testLocName, `Created location name matches`);
  const testLocId = createLoc.data.id;

  // 11. Master PIC / Karyawan API
  const empList = await request('GET', '/api/employees');
  assert(empList.status === 200, `GET /api/employees status 200`);
  assert(Array.isArray(empList.data) && empList.data.length >= 5, `Employees list returned at least 5 seeded items (${empList.data.length})`);
  const evaCecil = empList.data.find(e => e.name === 'Eva Cecil');
  assert(Boolean(evaCecil), `Seeded employee 'Eva Cecil' found in PIC master`);
  assert(evaCecil?.department === 'Support Indent', `Eva Cecil department is 'Support Indent'`);

  const testNik = `EMP-TEST-${Date.now().toString().slice(-4)}`;
  const createEmp = await request('POST', '/api/employees', {
    nik: testNik,
    name: 'Staff Operasional Test',
    department: 'Team Delivery',
    position: 'Driver Operasional',
    phone_number: '081299887766'
  }, authToken);
  assert(createEmp.status === 201, `POST /api/employees status 201`);
  assert(createEmp.data.nik === testNik, `Created employee NIK matches`);
  const testEmpId = createEmp.data.id;

  // 12. Asset with Location, Employee & Photo-matched BAST Handover
  const phoneAsset = await request('POST', '/api/assets', {
    name: 'Oppo A5 (Fasilitas Kantor)',
    category: 'IT',
    subcategory: 'smartphone',
    serial_number: 'SN-OPPO-88192',
    location_id: testLocId,
    specs: {
      phone_number: '081703803761',
      sim_package: 'Biz Starter',
      unit_price: 2450000
    },
    userName: 'IT Admin'
  });
  assert(phoneAsset.status === 201, `Smartphone asset created with status 201`);
  const phoneAssetId = phoneAsset.data.id;

  // Handover to Eva Cecil with Known By 1 & 2 and BAST template
  const phoneHandover = await request('POST', `/api/assets/${phoneAssetId}/handover`, {
    to_employee_id: evaCecil.id,
    action_type: 'checkout',
    condition: 'Baru, include Charger',
    known_by_1: 'Supervisor Indent',
    known_by_2: 'GA-IT Management',
    bast_template: 'gadget',
    notes: 'Penyerahan fasilitas HP perusahaan untuk staff Indent',
    userName: 'Alex'
  });
  assert(phoneHandover.status === 200, `Smartphone handover to employee status 200`);
  assert(typeof phoneHandover.data.bast_number === 'string', `Handover generated BAST number`);

  // Verify History
  const history = await request('GET', `/api/assets/${phoneAssetId}/history`);
  assert(history.status === 200, `Asset history status 200`);
  assert(history.data.handovers.length >= 1, `History returns handover record`);
  const latestHandover = history.data.handovers[0];
  assert(latestHandover.to_employee_name === 'Eva Cecil', `Handover recipient employee is Eva Cecil (${latestHandover.to_employee_name})`);
  assert(latestHandover.to_employee_dept === 'Support Indent', `Handover recipient department is Support Indent`);
  assert(latestHandover.known_by_1 === 'Supervisor Indent', `Known by 1 is Supervisor Indent`);
  assert(latestHandover.bast_template === 'gadget', `BAST template is gadget`);

  // Cleanup test assets and records
  await request('DELETE', `/api/assets/${phoneAssetId}`);
  await request('DELETE', `/api/employees/${testEmpId}`, null, authToken);
  await request('DELETE', `/api/locations/${testLocId}`, null, authToken);

  // 13. Batch Import Categories, Locations, Employees & Consumables
  const ts = Date.now().toString().slice(-5);
  const impCat = await request('POST', '/api/categories/batch-import', {
    items: [{ domain: 'IT', code: `imp_cat_${ts}`, name: `Imported Cat ${ts}`, tag_prefix: `IT-IC${ts.slice(-2)}` }],
    overwriteExisting: false
  }, authToken);
  assert(impCat.status === 200, `POST /api/categories/batch-import status 200`);
  assert(impCat.data.importedCount === 1, `Imported 1 category`);

  const impLoc = await request('POST', '/api/locations/batch-import', {
    items: [{ name: `Imported Loc ${ts}`, building_floor: 'Lt 9', description: 'CI Test' }],
    overwriteExisting: false
  }, authToken);
  assert(impLoc.status === 200, `POST /api/locations/batch-import status 200`);
  assert(impLoc.data.importedCount === 1, `Imported 1 location`);

  const impEmp = await request('POST', '/api/employees/batch-import', {
    items: [{ nik: `IMP-${ts}`, name: `Imported PIC ${ts}`, department: 'Support Indent', position: 'Staff', phone_number: '0811223344' }],
    overwriteExisting: false
  }, authToken);
  assert(impEmp.status === 200, `POST /api/employees/batch-import status 200`);
  assert(impEmp.data.importedCount === 1, `Imported 1 employee`);

  const impCsm = await request('POST', '/api/consumables/batch-import', {
    items: [{ name: `Ribbon Test ${ts}`, category: 'ribbon', unit: 'pcs', current_stock: 10, min_stock_alert: 3 }],
    overwriteExisting: false
  });
  assert(impCsm.status === 200, `POST /api/consumables/batch-import status 200`);
  assert(impCsm.data.importedCount === 1, `Imported 1 ribbon consumable`);

  // 14. Monthly Consumables Report (ATK / Tinta / Ribbon)
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRep = await request('GET', `/api/reports/consumables-monthly?month=${currentMonth}&category=ribbon`);
  assert(monthlyRep.status === 200, `GET /api/reports/consumables-monthly status 200`);
  assert(monthlyRep.data.month === currentMonth, `Monthly report period matches ${currentMonth}`);
  assert(Array.isArray(monthlyRep.data.items) && monthlyRep.data.items.some(i => i.name === `Ribbon Test ${ts}` && i.total_in_month >= 10), `Monthly report includes imported ribbon and restock count`);

  const monthlyCsv = await request('GET', `/api/reports/export?type=consumables-monthly&month=${currentMonth}`);
  assert(monthlyCsv.status === 200, `Monthly consumables CSV export status 200`);
  assert(monthlyCsv.headers['content-type']?.includes('text/csv'), `Monthly CSV Content-Type is text/csv`);

  // Cleanup imported test rows
  const catsAll = await request('GET', '/api/categories');
  const createdCat = (catsAll.data || []).find(c => c.code === `imp_cat_${ts}`);
  if (createdCat) await request('DELETE', `/api/categories/${createdCat.id}`, null, authToken);

  const locsAll = await request('GET', '/api/locations');
  const createdLoc = (locsAll.data || []).find(l => l.name === `Imported Loc ${ts}`);
  if (createdLoc) await request('DELETE', `/api/locations/${createdLoc.id}`, null, authToken);

  const empsAll = await request('GET', '/api/employees');
  const createdEmp = (empsAll.data || []).find(e => e.nik === `IMP-${ts}`);
  if (createdEmp) await request('DELETE', `/api/employees/${createdEmp.id}`, null, authToken);

  // 15. Security Hardening Checks
  const unauthLoc = await request('POST', '/api/locations', { name: 'Unauthorized Loc' });
  assert(unauthLoc.status === 401, `Unauthenticated POST /api/locations rejected with 401`);
  assert(!unauthLoc.headers['x-powered-by'], `X-Powered-By header disabled`);
  assert(unauthLoc.headers['x-content-type-options'] === 'nosniff', `X-Content-Type-Options: nosniff header present`);

  const oversizedBatch = Array.from({ length: 501 }, (_, i) => ({ name: `Loc ${i}` }));
  const overImport = await request('POST', '/api/locations/batch-import', { items: oversizedBatch }, authToken);
  assert(overImport.status === 400, `Oversized batch import (>500 items) rejected with 400`);

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
