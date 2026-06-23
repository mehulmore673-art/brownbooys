import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../App';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const MENU = [
  { id: 1, title: { en: "Test Burger", hi: "टेस्ट", gu: "ટેસ્ટ" }, price: 99, available: true },
];
const SHOP = { shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5 };

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test('order card shows formatted date from createdAt, not raw client date/time', async () => {
  const orders = [
    {
      _id: 'abc123456',
      items: [{ name: 'Test Burger', qty: 1, price: 99 }],
      total: 99,
      status: 'Preparing',
      orderType: 'pickup',
      // Server-side createdAt should take priority over client-supplied date/time
      createdAt: '2026-06-14T08:30:00.000Z',
      date: 'WRONG_DATE', // simulate a mismatch to prove createdAt wins
      time: 'WRONG_TIME',
    },
  ];
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => MENU });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => SHOP });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/orders')) return Promise.resolve({ ok: true, status: 200, json: async () => orders });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const ordersBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Orders');
  fireEvent.click(ordersBtn.closest('button'));

  await waitFor(() => {
    const timeEl = document.querySelector('.order-card__time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl.textContent).not.toContain('WRONG_DATE');
    expect(timeEl.textContent).not.toContain('WRONG_TIME');
    // Should contain a real formatted date (year 2026 from createdAt)
    expect(timeEl.textContent).toMatch(/2026/);
  });
});

test('order card falls back to date/time fields when createdAt is missing (legacy orders)', async () => {
  const orders = [
    { _id: 'legacy123', items: [{ name: 'Test Burger', qty: 1, price: 99 }], total: 99, status: 'Completed', orderType: 'pickup', date: '01 Jan 2026', time: '09:00 AM' },
  ];
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => MENU });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => SHOP });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/orders')) return Promise.resolve({ ok: true, status: 200, json: async () => orders });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const ordersBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Orders');
  fireEvent.click(ordersBtn.closest('button'));

  await waitFor(() => {
    const timeEl = document.querySelector('.order-card__time');
    expect(timeEl.textContent).toContain('01 Jan 2026');
    expect(timeEl.textContent).toContain('09:00 AM');
  });
});

test('orders persist in database across logout/login cycle (not deleted, just hidden while logged out)', async () => {
  const userAOrders = [
    { _id: '652f1a2b3c4d5e6f7a8b9999', items: [{ name: 'Test Burger', qty: 1, price: 99 }], total: 99, status: 'Completed', orderType: 'pickup', createdAt: '2026-06-10T10:00:00.000Z' },
  ];

  let requestedUserId = null;
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => MENU });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => SHOP });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/orders')) {
      const match = u.match(/userId=([^&]+)/);
      requestedUserId = match ? decodeURIComponent(match[1]) : null;
      return Promise.resolve({ ok: true, status: 200, json: async () => (requestedUserId === '9876543210' ? userAOrders : []) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User A');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  // View orders while logged in — should see the order
  const ordersBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Orders');
  fireEvent.click(ordersBtn.closest('button'));
  await waitFor(() => expect(screen.getByText(/#8b9999/)).toBeInTheDocument());

  // Logout
  const logoutBtn = screen.getByLabelText('Logout');
  fireEvent.click(logoutBtn);
  await waitFor(() => expect(localStorage.getItem('userId')).toBeNull());

  // Orders tab now prompts login (order data is hidden, not deleted)
  fireEvent.click(ordersBtn.closest('button'));
  await waitFor(() => expect(screen.getByText(/Please log in to view your orders/i)).toBeInTheDocument());

  // Log back in as the SAME user (same phone number) via the profile/login form
  const profileBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Profile');
  fireEvent.click(profileBtn.closest('button'));

  const phoneInput = await screen.findByLabelText(/Phone Number/i);
  fireEvent.change(phoneInput, { target: { value: '9876543210' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

  await waitFor(() => expect(localStorage.getItem('userId')).toBe('9876543210'));

  // Go back to orders — the SAME order should reappear (proves it was
  // never deleted, only inaccessible while logged out)
  fireEvent.click(ordersBtn.closest('button'));
  await waitFor(() => {
    expect(screen.getByText(/#8b9999/)).toBeInTheDocument();
  }, { timeout: 10000 });
}, 15000);
