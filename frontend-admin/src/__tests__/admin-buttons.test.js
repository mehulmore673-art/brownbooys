import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminPanel from '../AdminPanel';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  if (!global.URL.createObjectURL) global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = jest.fn();
  window.confirm = jest.fn(() => true);
});

function baseMock(calls, overrides = {}) {
  return jest.fn((url, opts) => {
    const u = String(url);
    const method = opts?.method || 'GET';
    calls.push({ url: u, method, body: opts?.body });

    if (overrides[u + ':' + method]) return overrides[u + ':' + method]();

    if (u.includes('/api/orders?admin=true')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ([
        { _id: 'order123', items: [{ name: 'Test Item', qty: 1, price: 50 }], total: 50, status: 'Pending', orderType: 'pickup', createdAt: new Date().toISOString(), userName: 'Test', userPhone: '9999999999', date: '13 Jun 2026', time: '10:00 AM' },
      ]) });
    }
    if (u.includes('/api/orders/') && method === 'PUT') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, order: { _id: 'order123', status: 'Completed' } }) });
    }
    if (u.includes('/api/orders/') && method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
    }
    if (u.includes('/api/menu') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/shop') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 0, shopLongitude: 0 }) });
    if (u.includes('/api/shop') && method === 'PUT') return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 1, todayRevenue: 50, totalOrders: 1, totalRevenue: 50 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => ([{ _id: 'offer1', imageUrl: 'https://example.com/banner.jpg', title: 'Test Banner', active: true }]) });
    if (u.includes('/api/offers') && method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
    if (u.includes('/api/offers') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });

    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

test('toggle shop open/closed button works', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const shopToggle = await screen.findByRole('button', { name: /Shop:/i });
  fireEvent.click(shopToggle);

  await waitFor(() => {
    const putCall = calls.find(c => c.url.includes('/api/shop') && c.method === 'PUT');
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall.body);
    expect(body.shopOpen).toBe(false); // was true, toggled to false
  });
});

test('toggle delivery on/off button works', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const deliveryToggle = await screen.findByRole('button', { name: /Delivery:/i });
  fireEvent.click(deliveryToggle);

  await waitFor(() => {
    const putCalls = calls.filter(c => c.url.includes('/api/shop') && c.method === 'PUT');
    expect(putCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(putCalls[putCalls.length - 1].body);
    expect(body.deliveryOn).toBe(false);
  });
});

test('order "Done" button updates status to Completed', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const doneBtn = await screen.findByRole('button', { name: /Done/i });
  fireEvent.click(doneBtn);

  await waitFor(() => {
    const putCall = calls.find(c => c.url.includes('/api/orders/order123') && c.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(JSON.parse(putCall.body)).toEqual({ status: 'Completed' });
  });
});

test('order status dropdown change works', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const select = await screen.findByDisplayValue('Pending');
  fireEvent.change(select, { target: { value: 'Preparing' } });

  await waitFor(() => {
    const putCalls = calls.filter(c => c.url.includes('/api/orders/order123') && c.method === 'PUT');
    expect(putCalls.length).toBeGreaterThan(0);
    expect(JSON.parse(putCalls[putCalls.length - 1].body)).toEqual({ status: 'Preparing' });
  });
});

test('delete order button works with confirm', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const deleteBtn = await screen.findByRole('button', { name: /Delete order/i });
  fireEvent.click(deleteBtn);

  await waitFor(() => {
    expect(window.confirm).toHaveBeenCalled();
    const delCall = calls.find(c => c.url.includes('/api/orders/order123') && c.method === 'DELETE');
    expect(delCall).toBeDefined();
  });
});

test('offers tab: delete banner button works', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const bannersTab = await screen.findByRole('button', { name: /Banners/i });
  fireEvent.click(bannersTab);
  await flushPromises();

  const deleteBannerBtn = await screen.findByRole('button', { name: /🗑️/i });
  fireEvent.click(deleteBannerBtn);

  await waitFor(() => {
    const delCall = calls.find(c => c.url.includes('/api/offers/offer1') && c.method === 'DELETE');
    expect(delCall).toBeDefined();
  });
});

test('offers tab: upload banner without selecting file shows warning, no request sent', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const bannersTab = await screen.findByRole('button', { name: /Banners/i });
  fireEvent.click(bannersTab);
  await flushPromises();

  const uploadBtn = await screen.findByRole('button', { name: /Upload Banner/i });
  fireEvent.click(uploadBtn);

  await waitFor(() => {
    expect(screen.getByText(/Select an image first/i)).toBeInTheDocument();
  });

  const postCall = calls.find(c => c.url.includes('/api/offers') && c.method === 'POST');
  expect(postCall).toBeUndefined();
});

test('settings tab: save settings button works', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'pw');

  render(<AdminPanel />);
  await flushPromises();

  const settingsTab = await screen.findByRole('button', { name: /Settings/i });
  fireEvent.click(settingsTab);
  await flushPromises();

  const saveButtons = await screen.findAllByRole('button', { name: /Save Settings|Save Location/i });
  fireEvent.click(saveButtons[0]);

  await waitFor(() => {
    const putCall = calls.find(c => c.url.includes('/api/shop') && c.method === 'PUT');
    expect(putCall).toBeDefined();
  });
});
