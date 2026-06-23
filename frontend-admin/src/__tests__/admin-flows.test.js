import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminPanel from '../AdminPanel';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  // jsdom doesn't implement these — real browsers do. Polyfill for testing only.
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  }
  if (!global.URL.revokeObjectURL) {
    global.URL.revokeObjectURL = jest.fn();
  }
});

function mockFetchSequence(handler) {
  global.fetch = jest.fn((url, opts) => handler(url, opts));
}

test('admin login -> dashboard renders without crashing', async () => {
  mockFetchSequence((url, opts) => {
    const u = String(url);
    if (u.includes('/api/admin/login')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, token: 'mock.jwt.token', expiresIn: '12h' }) });
    }
    if (u.includes('/api/orders?admin=true')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    }
    if (u.includes('/api/menu')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ([
        { id: 1, title: { en: 'Test Burger', hi: 'टेस्ट', gu: 'ટેસ્ટ' }, price: 50, image: '', available: true },
      ]) });
    }
    if (u.includes('/api/shop')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({
        shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5,
        shopLatitude: 0, shopLongitude: 0,
      }) });
    }
    if (u.includes('/api/orders/analytics')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    }
    if (u.includes('/api/offers/all')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  render(<AdminPanel />);

  // Should show login screen first
  const pwInput = await screen.findByPlaceholderText(/password/i);
  fireEvent.change(pwInput, { target: { value: 'test-admin-password-123456' } });

  const loginBtn = screen.getByRole('button', { name: /access admin panel/i });
  fireEvent.click(loginBtn);

  await flushPromises();
  await waitFor(() => expect(localStorage.getItem('adminToken')).toBe('mock.jwt.token'));
});

test('add item form: image upload failure shows error toast and does not crash', async () => {
  const calls = [];
  mockFetchSequence((url, opts) => {
    const u = String(url);
    calls.push({ url: u, method: opts?.method || 'GET' });

    if (u.includes('/api/orders?admin=true')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/menu') && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, id: 99 }) });
    }
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 0, shopLongitude: 0 }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    // Simulate upload failure — server returns 500
    if (u.includes('/api/upload')) return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Upload failed' }) });

    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  localStorage.setItem('adminToken', 'test-admin-password-123456');

  render(<AdminPanel />);
  await flushPromises();

  const menuTabBtn = await screen.findByRole('button', { name: /Menu/i });
  fireEvent.click(menuTabBtn);
  await flushPromises();

  const addBtn = await screen.findByRole('button', { name: /\+ Add Item/i });
  fireEvent.click(addBtn);
  await flushPromises();

  const enInput = screen.getByPlaceholderText(/english/i);
  fireEvent.change(enInput, { target: { value: 'Item With Bad Image' } });

  const priceInputs = screen.getAllByRole('spinbutton');
  fireEvent.change(priceInputs[0], { target: { value: '99' } });

  const fileInputs = document.querySelectorAll('input[type="file"]');
  const file = new File(['dummy'], 'bad.jpg', { type: 'image/jpeg' });
  Object.defineProperty(fileInputs[0], 'files', { value: [file] });
  fireEvent.change(fileInputs[0]);
  await flushPromises();

  const submitBtn = screen.getByRole('button', { name: /Add to Menu/i });
  fireEvent.click(submitBtn);

  // Should show error toast, NOT crash, and NOT call /api/menu POST
  await waitFor(() => {
    expect(screen.getByText(/Image upload failed/i)).toBeInTheDocument();
  }, { timeout: 3000 });

  const menuPostCall = calls.find(c => c.url.includes('/api/menu') && c.method === 'POST');
  expect(menuPostCall).toBeUndefined();

  // Form should remain open (not silently closed) so admin can retry
  expect(screen.getByRole('button', { name: /Add to Menu/i })).toBeInTheDocument();
});

test('add item form: submit triggers image upload then menu POST', async () => {
  const calls = [];
  mockFetchSequence((url, opts) => {
    const u = String(url);
    calls.push({ url: u, method: opts?.method || 'GET' });

    if (u.includes('/api/orders?admin=true')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/menu') && opts?.method === 'POST') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, id: 99 }) });
    }
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 0, shopLongitude: 0 }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/upload')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ url: 'https://res.cloudinary.com/test/image/upload/v1/test.jpg' }) });

    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  // Pre-authenticate
  localStorage.setItem('adminToken', 'test-admin-password-123456');

  render(<AdminPanel />);
  await flushPromises();

  // Navigate to Menu tab first (Orders tab is the default)
  const menuTabBtn = await screen.findByRole('button', { name: /Menu/i });
  fireEvent.click(menuTabBtn);
  await flushPromises();

  // Find "Add Item" trigger button
  const addBtn = await screen.findByRole('button', { name: /\+ Add Item/i });
  fireEvent.click(addBtn);

  await flushPromises();

  // Fill English name field
  const enInput = screen.getByPlaceholderText(/english/i) || screen.getAllByRole('textbox')[0];
  fireEvent.change(enInput, { target: { value: 'New Test Item' } });

  // Fill price
  const priceInputs = screen.getAllByRole('spinbutton');
  if (priceInputs.length > 0) {
    fireEvent.change(priceInputs[0], { target: { value: '99' } });
  }

  // Simulate file selection
  const fileInputs = document.querySelectorAll('input[type="file"]');
  expect(fileInputs.length).toBeGreaterThan(0);
  const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
  Object.defineProperty(fileInputs[0], 'files', { value: [file] });
  fireEvent.change(fileInputs[0]);

  await flushPromises();

  // Submit
  const submitBtn = screen.getByRole('button', { name: /Add to Menu/i });
  fireEvent.click(submitBtn);

  await waitFor(() => {
    const uploadCall = calls.find(c => c.url.includes('/api/upload'));
    expect(uploadCall).toBeDefined();
  }, { timeout: 3000 });
});
