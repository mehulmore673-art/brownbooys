import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../App';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const MENU = [
  { id: 1, title: { en: "Test Burger", hi: "टेस्ट बर्गर", gu: "ટેસ્ટ બર્ગર" }, price: 99, image: "", available: true, category: "Burgers" },
];

const SHOP = { shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 22.3072, shopLongitude: 73.1812 };

function mockFetchDefault(opts = {}) {
  return jest.fn((url, init) => {
    const u = String(url);
    const method = init?.method || 'GET';
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => MENU });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => (opts.shop || SHOP) });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/orders') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
    if (u.includes('/api/orders')) return Promise.resolve({ ok: true, status: 200, json: async () => (opts.orders || []) });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test('geolocation permission denied shows clear error, does not crash', async () => {
  global.fetch = mockFetchDefault();
  global.navigator.geolocation = {
    getCurrentPosition: jest.fn((success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 });
    }),
  };
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);
  fireEvent.change(orderTypeSelect, { target: { value: 'delivery' } });

  const detectBtn = within(modal).getByRole('button', { name: /Auto-detect my location/i });
  fireEvent.click(detectBtn);

  await waitFor(() => {
    expect(screen.getByText(/Location permission denied/i)).toBeInTheDocument();
  });

  // App should still be functional — modal still open, checkout still present
  expect(within(modal).getByRole('button', { name: /Checkout/i })).toBeInTheDocument();
});

test('geolocation timeout shows clear error', async () => {
  global.fetch = mockFetchDefault();
  global.navigator.geolocation = {
    getCurrentPosition: jest.fn((success, error) => {
      error({ code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3 });
    }),
  };
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);
  fireEvent.change(orderTypeSelect, { target: { value: 'delivery' } });

  const detectBtn = within(modal).getByRole('button', { name: /Auto-detect my location/i });
  fireEvent.click(detectBtn);

  await waitFor(() => {
    expect(screen.getByText(/Location request timed out/i)).toBeInTheDocument();
  });
});

test('geolocation not supported shows clear error', async () => {
  global.fetch = mockFetchDefault();
  delete global.navigator.geolocation; // simulate unsupported browser
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);
  fireEvent.change(orderTypeSelect, { target: { value: 'delivery' } });

  const detectBtn = within(modal).getByRole('button', { name: /Auto-detect my location/i });
  fireEvent.click(detectBtn);

  await waitFor(() => {
    expect(screen.getByText(/Geolocation is not supported/i)).toBeInTheDocument();
  });
});

test('manual address entry works as fallback to geolocation', async () => {
  global.fetch = mockFetchDefault();
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);
  fireEvent.change(orderTypeSelect, { target: { value: 'delivery' } });

  const addressInput = within(modal).getByPlaceholderText(/Street, Area, City/i);
  fireEvent.change(addressInput, { target: { value: '123 Test Street' } });

  expect(addressInput.value).toBe('123 Test Street');
});

test('cart persists to localStorage and survives remount', async () => {
  global.fetch = mockFetchDefault();
  const { unmount } = render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  await flushPromises();

  const stored = JSON.parse(localStorage.getItem('cart'));
  expect(stored).toHaveLength(1);
  expect(stored[0].qty).toBe(1);

  unmount();

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const cartFloat = document.querySelector('.cart-float__price');
  expect(cartFloat).toHaveTextContent('₹99');
});

test('switching order type away from delivery resets delivery state', async () => {
  global.fetch = mockFetchDefault();
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);

  fireEvent.change(orderTypeSelect, { target: { value: 'delivery' } });
  const addressInput = within(modal).getByPlaceholderText(/Street, Area, City/i);
  fireEvent.change(addressInput, { target: { value: '123 Test Street' } });
  expect(addressInput.value).toBe('123 Test Street');

  // Switch to pickup then back to delivery — address should be cleared
  fireEvent.change(orderTypeSelect, { target: { value: 'pickup' } });
  fireEvent.change(orderTypeSelect, { target: { value: 'delivery' } });

  const addressInput2 = within(modal).getByPlaceholderText(/Street, Area, City/i);
  expect(addressInput2.value).toBe('');
});

test('app does not crash if menu API fails', async () => {
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/menu')) return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => SHOP });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/Could not load menu/i)).toBeInTheDocument();
  });

  // App shell should still render
  expect(screen.getByRole('navigation', { name: /Main navigation/i })).toBeInTheDocument();
  expect(screen.getByText(/No items found/i)).toBeInTheDocument();
});

test('app does not crash if shop API fails (uses defaults)', async () => {
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => MENU });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  // Should not show "closed" banner since default shopOpen=true is used
  expect(screen.queryByText(/We're currently closed/i)).not.toBeInTheDocument();
});
