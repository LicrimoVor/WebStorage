// Run after npm run build. CHROME_PATH points to a local Chromium executable.
// Only synthetic API responses are used; no application database is contacted.
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(path.join(root, '../backend/openapi.json'), 'utf8'));
const output = path.join(root, 'public/help/screenshots');
const browserPath = process.env.CHROME_PATH;
if (!browserPath || !existsSync(browserPath)) throw new Error('Set CHROME_PATH to Chromium');
mkdirSync(output, {recursive: true});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = '11111111-1111-4111-8111-111111111111';
const stamp = '2026-09-29T08:00:00Z';
function sample(value = {}, depth = 0) {
  if (depth > 12) return null;
  if (value.$ref) return sample(schema.components.schemas[value.$ref.split('/').at(-1)], depth + 1);
  if (value.anyOf) return sample(value.anyOf.find((item) => item.type !== 'null'), depth + 1);
  if (value.enum) return value.enum[0];
  if (value.type === 'array') return [];
  if (value.type === 'object' || value.properties) return Object.fromEntries(Object.entries(value.properties ?? {}).map(([key, prop]) => [key, sample(prop, depth + 1)]));
  if (value.type === 'boolean') return false;
  if (value.type === 'integer' || value.type === 'number') return 0;
  if (value.format === 'uuid') return id;
  if (value.format === 'date-time') return stamp;
  return '0';
}
const material = {...sample(schema.components.schemas.MaterialRead), id, name: 'Лист алюминиевый', unit: 'шт', free_quantity: '24', required_quantity: '4', defective_quantity: '2', price: '1500', image: null, url: null, groups: []};
const operation = {...sample(schema.components.schemas.OperationRead), id, name: 'Сборка корпуса', time_norm: '20', price_per_operation: '350', group_id: null};
const employee = {...sample(schema.components.schemas.EmployeeRead), id, full_name: 'Учебный сотрудник', active: true, compensation_type: 'piecework', hourly_rate: null, comment: 'Пример для инструкции'};
const product = {...sample(schema.components.schemas.ManufacturedItemRead), id, name: 'Корпус К-1', is_product: true, unit: 'шт', product_id: null, image: null};
const permissions = ['planning', 'processes', 'warehouse', 'operations', 'personnel', 'repairs', 'sales', 'finance'];
function api(url) {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith('/auth/session')) return {username: 'Учебный администратор', roles: ['admin'], permissions};
  if (pathname.endsWith('/auth/profile')) return {username: 'Учебный администратор', roles: ['admin'], can_change_password: true, created_at: stamp, last_login_at: stamp};
  if (pathname === `/api/v1/materials/${id}`) return material;
  if (pathname === `/api/v1/operations/${id}`) return {...operation, required_quantity: '12', completed_quantity: '8', required_time_minutes: '240'};
  if (pathname === `/api/v1/manufactured-items/${id}`) return product;
  if (pathname === '/api/v1/manufactured-items/55555555-5555-4555-8555-555555555555') return {...product, id: '55555555-5555-4555-8555-555555555555', name: 'Заготовка К-1', is_product: false, product_id: id, free_quantity: '12', required_quantity: '16', to_produce_quantity: '4'};
  if (pathname.endsWith('/operation-groups')) return [
    {id, name: 'Сборочные работы', parent_id: null},
    {id: '22222222-2222-4222-8222-222222222222', name: 'Корпуса', parent_id: id},
    {id: '33333333-3333-4333-8333-333333333333', name: 'Электроника', parent_id: id},
  ];
  if (pathname.endsWith('/users')) return [{id, username: 'operator', is_admin: false, active: true, permissions: ['warehouse'], created_at: stamp, last_login_at: stamp}];
  if (pathname.endsWith('/funding-sources')) return [{id, name: 'Основной счёт'}];
  if (pathname.endsWith('/inventory-groups')) return [
    {id, name: 'Металлы', parent_id: null},
    {id: '22222222-2222-4222-8222-222222222222', name: 'Листовой металл', parent_id: id},
    {id: '33333333-3333-4333-8333-333333333333', name: 'Крепёж', parent_id: id},
    {id: '44444444-4444-4444-8444-444444444444', name: 'Электроника', parent_id: null},
  ].map((group) => ({...group, material_count: 0, semi_finished_count: 0, created_at: stamp, updated_at: stamp}));
  if (pathname.endsWith('/warehouse/revision')) return [
    {id, name: material.name, type: 'material', image: null, unit: 'шт', current_quantity: '24', products: [], groups: []},
    {id, name: product.name, type: 'product', image: null, unit: 'шт', current_quantity: '3', products: [], groups: []},
    {id: '55555555-5555-4555-8555-555555555555', name: 'Заготовка К-1', type: 'semi_finished', image: null, unit: 'шт', current_quantity: '12', products: [{id, name: product.name}], groups: []},
  ].filter((row) => !new URL(url).searchParams.get('type') || row.type === new URL(url).searchParams.get('type'));
  if (pathname.endsWith('/composition')) return {process_id: id, version_number: 1, has_recipe: true, entries: [
    {id, kind: 'material', name: material.name, quantity: '2.5', unit: 'шт'},
    {id, kind: 'operation', name: operation.name, quantity: '1', unit: 'операций'},
  ]};
  if (pathname.endsWith('/business-documents') || pathname.endsWith('/product-units')) return [];
  const route = Object.keys(schema.paths).find((key) => new RegExp(`^${key.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(pathname));
  const value = sample(schema.paths[route]?.get?.responses?.['200']?.content?.['application/json']?.schema);
  if (value && !Array.isArray(value) && Array.isArray(value.items)) {
    const rows = pathname.endsWith('/materials') ? [material] : pathname.endsWith('/operations') ? [operation] : pathname.endsWith('/employees') ? [employee] : pathname.endsWith('/manufactured-items') ? [product] : [];
    return {...value, items: rows, total: rows.length, page: 1, page_size: 20};
  }
  return value;
}
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const candidate = path.join(root, 'dist', pathname);
  const file = existsSync(candidate) && path.extname(candidate) ? candidate : path.join(root, 'dist/index.html');
  const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp'}[path.extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, {'Content-Type': type}); res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(4178, '127.0.0.1', resolve));
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'webstorage-guide-'))}`, '--no-first-run', 'about:blank'], {windowsHide: true, stdio: 'ignore'});
let ws;
try {
  let version;
  for (let i = 0; i < 40; i++) {
    try {version = await (await fetch('http://127.0.0.1:9333/json/version', {signal: AbortSignal.timeout(1000)})).json(); break;} catch {await delay(100);}
  }
  if (!version) throw new Error('Chromium debugging endpoint did not start');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, {once: true}));
  let seq = 0, session;
  const pending = new Map();
  const send = (method, params = {}, top = false) => new Promise((resolve, reject) => {
    const messageId = ++seq; pending.set(messageId, {resolve, reject});
    ws.send(JSON.stringify({id: messageId, method, params, ...(!top && session ? {sessionId: session} : {})}));
  });
  ws.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {const request = pending.get(message.id); pending.delete(message.id); if (message.error) request.reject(message.error); else request.resolve(message.result);}
    if (message.method === 'Fetch.requestPaused') await send('Fetch.fulfillRequest', {requestId: message.params.requestId, responseCode: 200, responseHeaders: [{name: 'Content-Type', value: 'application/json'}, {name: 'Access-Control-Allow-Origin', value: '*'}], body: Buffer.from(JSON.stringify(api(message.params.request.url))).toString('base64')});
  });
  const target = await send('Target.createTarget', {url: 'about:blank'}, true);
  session = (await send('Target.attachToTarget', {targetId: target.targetId, flatten: true}, true)).sessionId;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', {patterns: [{urlPattern: '*/api/v1/*'}]});
  await send('Emulation.setDeviceMetricsOverride', {width: 1200, height: 820, deviceScaleFactor: 1, mobile: false});
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw result.exceptionDetails;
    return result.result.value;
  };
  for (const [name, route, button] of [
    ['planning', '/production-plans'], ['processes', '/processes'], ['warehouse', '/warehouse'],
    ['material-card', '/warehouse', 'Лист алюминиевый'],
    ['manufactured', '/warehouse?tab=manufactured'],
    ['composition', '/warehouse?tab=manufactured', 'Заготовка К-1'],
    ['receipt', '/warehouse/receipt'], ['revision', '/warehouse/revision'],
    ['operations', '/operations'], ['personnel', '/personnel'], ['repairs', '/repairs'],
    ['operation-card', '/operations', 'Сборка корпуса'],
    ['sales', '/sales'], ['finance', '/finance'], ['settings', '/settings'],
    ['users', '/settings/users', 'Добавить пользователя'], ['profile', '/profile'],
  ]) {
    if (process.env.GUIDE_CHAPTERS && !process.env.GUIDE_CHAPTERS.split(',').includes(name)) continue;
    await send('Page.navigate', {url: `http://127.0.0.1:4178${route}`});
    for (let i = 0; i < 80; i++) {if (await evaluate(`Boolean(document.querySelector('main h1'))`)) break; await delay(100);}
    await delay(500);
    if (button) {await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(button)}))?.click()`); await delay(400);}
    const text = await evaluate('document.body.innerText');
    if (/Не удалось открыть страницу|Не удалось загрузить/.test(text)) throw new Error(`${name}: ${text}`);
    const screenshot = await send('Page.captureScreenshot', {format: 'webp', quality: 85});
    writeFileSync(path.join(output, `${name}.webp`), Buffer.from(screenshot.data, 'base64'));
    console.log(`Captured ${name}`);
  }
} finally {
  ws?.close(); browser.kill(); server.closeAllConnections(); server.close();
}
