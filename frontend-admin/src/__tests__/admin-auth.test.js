import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminPanel from '../AdminPanel';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test('401 from any admin call triggers auto-logout and shows login screen', async () => {
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/orders?admin=true')) {
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized.' }) });
    }
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5 }) });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  localStorage.setItem('adminToken', 'stale-or-wrong-password');

  render(<AdminPanel />);
  await flushPromises();
  await flushPromises();

  await waitFor(() => {
    expect(localStorage.getItem('adminToken')).toBeNull();
  });

  // Should fall back to login screen
  await waitFor(() => {
    expect(screen.getByText(/Admin Access/i)).toBeInTheDocument();
  });
});

test('logout button clears token and shows login screen', async () => {
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/orders?admin=true')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5 }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  localStorage.setItem('adminToken', 'valid-password');

  render(<AdminPanel />);
  await flushPromises();

  const logoutBtn = await screen.findByRole('button', { name: /Logout/i });
  fireEvent.click(logoutBtn);

  expect(localStorage.getItem('adminToken')).toBeNull();
  await waitFor(() => {
    expect(screen.getByText(/Admin Access/i)).toBeInTheDocument();
  });
});
