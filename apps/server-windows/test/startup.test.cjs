const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const request = (url, options = {}) => fetch(url, {
  ...options, headers: { ...options.headers, Connection: 'close' }
});

test('server starts, serves admin and tickets, persists data and reports a busy port', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eliminacode-test-'));
  process.env.ELIMINACODE_DATA_DIR = dataDir;
  process.env.ELIMINACODE_HOST = '127.0.0.1';
  const occupied = http.createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  process.env.ELIMINACODE_PORT = String(occupied.address().port);
  const { startServer } = require('../server.cjs');
  let info;
  try {
    await assert.rejects(startServer(), { code: 'EADDRINUSE' });
    await new Promise(resolve => occupied.close(resolve));
    info = await startServer();
    const base = `http://127.0.0.1:${info.port}`;
    assert.equal((await (await request(`${base}/api/health`)).json()).ok, true);
    const admin = await request(`${base}/admin`);
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /ELIMINACODE SERVER/);
    const departments = await (await request(`${base}/api/departments`)).json();
    assert.equal(departments.length, 5);
    const response = await request(`${base}/api/tickets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentId: 'salumeria' })
    });
    assert.equal(response.status, 200);
    const ticket = await response.json();
    assert.equal(ticket.number, 'S001');
    assert.match(ticket.qrDataUrl, /^data:image\/png;base64,/);
    await info.close();
    info = await startServer();
    const saved = await (await request(`${base}/api/tickets/${ticket.ticketId}`)).json();
    assert.equal(saved.number, 'S001');
    assert.ok(fs.existsSync(path.join(dataDir, 'eliminacode.sqlite')));
  } finally {
    if (occupied.listening) await new Promise(resolve => occupied.close(resolve));
    if (info) await info.close();
    // SQLite is held by the module until this test process exits; Windows
    // cannot remove its open database file, so cleanup is best effort.
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (err) {
      if (!['EBUSY', 'EPERM'].includes(err.code)) throw err;
    }
  }
});
