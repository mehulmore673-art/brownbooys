import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../App';

// jsdom doesn't execute external <script> tags, so loadRazorpayScript()
// would hang forever waiting for onload/onerror to fire naturally.
// Instead, pre-set window.Razorpay (as if checkout.js already loaded)
// and pre-insert the script tag with the expected id so
// loadRazorpayScript()'s real implementation short-circuits to
// `resolve(true)` via its `typeof window.Razorpay === "function"` check.
function primeRazorpayScript() {
  if (!document.getElementById('razorpay-script')) {
    const s = document.createElement('script');
    s.id = 'razorpay-script';
    document.body.appendChild(s);
  }
}

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const MENU = [
  { id: 1, title: { en: "Test Burger", hi: "टेस्ट बर्गर", gu: "ટેસ્ટ બર્ગર" }, price: 99, image: "", available: true, category: "Burgers" },
];

// Shop is at Vadodara coords; customer geolocation mocked to a point ~2km away (within free base km)
const SHOP = { shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 22.3072, shopLongitude: 73.1812 };

function mockFetchDefault(opts = {}) {
  const orderPosts = [];
  const fetchFn = jest.fn((url, init) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => MENU });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => (opts.shop || SHOP) });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/orders') && method === 'POST') {
      orderPosts.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, orderId: 'order123' }) });
    }
    if (u.includes('/api/orders')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/payment/create-order')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, orderId: 'rzp_order_1', amount: 9900, currency: 'INR', keyId: 'rzp_test_key' }) });
    }
    if (u.includes('/api/payment/verify')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, paymentId: 'pay_test_1' }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
  fetchFn._orderPosts = orderPosts;
  return fetchFn;
}

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();

  // Mock geolocation: a point ~2.2km from shop coords
  global.navigator.geolocation = {
    getCurrentPosition: jest.fn((success) => {
      success({ coords: { latitude: 22.32, longitude: 73.18 } });
    }),
  };

  // Mock reverse-geocoding fetch used inside getDeliveryLocation
  // (it calls fetch to nominatim — handled separately per test if needed)
});

test('pickup checkout (no auth) prompts login; after login, places order successfully without payment popup issues', async () => {
  global.fetch = mockFetchDefault();
  // suppress reverse-geocode network call noise — not used for pickup
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });

  // Default order type should be pickup
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);
  expect(orderTypeSelect.value).toBe('pickup');

  const checkoutBtn = within(modal).getByRole('button', { name: /Checkout/i });

  // Mock window.Razorpay since real script isn't loaded in jsdom
  const rzpInstance = { open: jest.fn(), on: jest.fn() };
  global.window.Razorpay = jest.fn(() => rzpInstance);
  primeRazorpayScript();

  fireEvent.click(checkoutBtn);

  await waitFor(() => {
    expect(global.window.Razorpay).toHaveBeenCalled();
  });

  // Verify Razorpay was configured with correct order id / amount from create-order response
  const rzpOptions = global.window.Razorpay.mock.calls[0][0];
  expect(rzpOptions.order_id).toBe('rzp_order_1');
  expect(rzpOptions.amount).toBe(9900);
  expect(rzpOptions.key).toBe('rzp_test_key');
  expect(typeof rzpOptions.handler).toBe('function');

  // Simulate successful payment callback
  await rzpOptions.handler({
    razorpay_order_id: 'rzp_order_1',
    razorpay_payment_id: 'pay_test_1',
    razorpay_signature: 'sig_test_1',
  });

  await waitFor(() => {
    expect(screen.getByText(/Order placed successfully/i)).toBeInTheDocument();
  });

  // Cart should be cleared and we should land on Orders tab
  await waitFor(() => expect(screen.getByText(/My Orders/i)).toBeInTheDocument());

  const posted = global.fetch._orderPosts[0];
  expect(posted.status).toBe('Paid');
  expect(posted.paymentId).toBe('pay_test_1');
  expect(posted.total).toBe(99);
});

test('delivery checkout: blocked without detected location', async () => {
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

  expect(orderTypeSelect.value).toBe('delivery');

  const checkoutBtn = within(modal).getByRole('button', { name: /Checkout/i });
  global.window.Razorpay = jest.fn(() => ({ open: jest.fn(), on: jest.fn() }));
  primeRazorpayScript();
  fireEvent.click(checkoutBtn);

  await waitFor(() => {
    expect(screen.getByText(/Please detect or enter your delivery location/i)).toBeInTheDocument();
  });

  // Razorpay should NOT have been opened
  expect(global.window.Razorpay).not.toHaveBeenCalled();
});

test('delivery checkout: with detected location below free-delivery threshold still allows checkout (charged delivery fee)', async () => {
  global.fetch = mockFetchDefault();
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  // Mock reverse geocode fetch to avoid real network call
  const originalFetch = mockFetchDefault();
  global.fetch = jest.fn((url, init) => {
    if (String(url).includes('nominatim')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ display_name: 'Test Address, Vadodara' }) });
    }
    return originalFetch(url, init);
  });
  global.fetch._orderPosts = originalFetch._orderPosts;

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  // Subtotal will be 99, below freeDeliveryAbove (400)
  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);
  fireEvent.change(orderTypeSelect, { target: { value: 'delivery' } });

  // Should show "add ₹X more for delivery" warning but NOT block checkout
  await waitFor(() => {
    expect(within(modal).getByText(/more for delivery/i)).toBeInTheDocument();
  });

  // Detect location
  const detectBtn = within(modal).getByRole('button', { name: /Auto-detect my location/i });
  fireEvent.click(detectBtn);

  await waitFor(() => {
    expect(within(modal).getByText(/Detected address/i)).toBeInTheDocument();
  }, { timeout: 8000 });

  // Distance ~1.95km, base 5km -> charge should be 0 (free, within base)
  const checkoutBtn = within(modal).getByRole('button', { name: /Checkout/i });
  global.window.Razorpay = jest.fn(() => ({ open: jest.fn(), on: jest.fn() }));
  primeRazorpayScript();
  fireEvent.click(checkoutBtn);

  await waitFor(() => {
    expect(global.window.Razorpay).toHaveBeenCalled();
  });

  const rzpOptions = global.window.Razorpay.mock.calls[0][0];
  // Total should equal subtotal (99) since within free base km -> delivery charge 0
  expect(rzpOptions.amount).toBe(9900);
}, 10000);

test('delivery unavailable: shows error and does not open payment', async () => {
  global.fetch = mockFetchDefault({ shop: { ...SHOP, deliveryOn: false } });
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const orderTypeSelect = within(modal).getByLabelText(/Order Type/i);

  // "delivery" option should not even be rendered since deliveryOn=false
  const options = Array.from(orderTypeSelect.querySelectorAll('option')).map(o => o.value);
  expect(options).not.toContain('delivery');
});

test('payment failure: rzp.on("payment.failed") re-enables checkout and shows error', async () => {
  global.fetch = mockFetchDefault();
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const checkoutBtn = within(modal).getByRole('button', { name: /Checkout/i });

  let failedHandler;
  global.window.Razorpay = jest.fn(() => ({
    open: jest.fn(),
    on: jest.fn((event, cb) => { if (event === 'payment.failed') failedHandler = cb; }),
  }));

  primeRazorpayScript();
  fireEvent.click(checkoutBtn);
  await waitFor(() => expect(global.window.Razorpay).toHaveBeenCalled());

  // Simulate Razorpay calling the failure callback
  failedHandler();

  await waitFor(() => {
    expect(screen.getByText(/Payment failed/i)).toBeInTheDocument();
  });

  // Checkout button should be re-enabled (not stuck spinning)
  await waitFor(() => {
    expect(within(modal).getByRole('button', { name: /Checkout/i })).not.toBeDisabled();
  });
});

test('payment modal dismissed: re-enables checkout with info toast', async () => {
  global.fetch = mockFetchDefault();
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const checkoutBtn = within(modal).getByRole('button', { name: /Checkout/i });

  let dismissHandler;
  global.window.Razorpay = jest.fn((opts) => {
    dismissHandler = opts.modal.ondismiss;
    return { open: jest.fn(), on: jest.fn() };
  });

  primeRazorpayScript();
  fireEvent.click(checkoutBtn);
  await waitFor(() => expect(global.window.Razorpay).toHaveBeenCalled());

  dismissHandler();

  await waitFor(() => {
    expect(screen.getByText(/Payment cancelled/i)).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(within(modal).getByRole('button', { name: /Checkout/i })).not.toBeDisabled();
  });
});
