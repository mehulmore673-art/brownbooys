import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../App';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const MENU = [
  { id: 1, title: { en: "Test Burger", hi: "टेस्ट बर्गर", gu: "ટેસ્ટ બર્ગર" }, price: 99, image: "", available: true, category: "Burgers", description: "A tasty test burger" },
  { id: 2, title: { en: "Test Wrap", hi: "टेस्ट रैप", gu: "ટેસ્ટ રેપ" }, price: 120, image: "", available: true, category: "Wraps",
    variants: [
      { name: { en: "Regular", hi: "रेगुलर", gu: "રેગ્યુલર" }, price: 80 },
      { name: { en: "Large", hi: "लार्ज", gu: "લાર્જ" }, price: 120 },
    ] },
  { id: 3, title: { en: "Unavailable Item", hi: "अनुपलब्ध", gu: "અનુપલબ્ધ" }, price: 50, available: false },
];

const SHOP = { shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 22.30, shopLongitude: 73.18 };

function mockFetchDefault(opts = {}) {
  return jest.fn((url, init) => {
    const u = String(url);
    const method = init?.method || 'GET';

    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => MENU });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => (opts.shop || SHOP) });
    if (u.includes('/api/offers')) return Promise.resolve({ ok: true, status: 200, json: async () => (opts.offers || []) });
    if (u.includes('/api/orders') && method === 'POST') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, orderId: 'order123' }) });
    }
    if (u.includes('/api/orders')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => (opts.orders || []) });
    }
    if (u.includes('/api/payment/create-order')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, orderId: 'rzp_order_1', amount: 9900, currency: 'INR', keyId: 'rzp_test_key' }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

/* ──────────────────────────────────────────────────────── */

test('menu loads and renders items, hides unavailable items', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);

  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());
  expect(screen.getByText('Test Wrap')).toBeInTheDocument();
  expect(screen.queryByText('Unavailable Item')).not.toBeInTheDocument();
});

test('search filters menu items by name', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const search = screen.getByLabelText(/Search menu items/i);
  fireEvent.change(search, { target: { value: 'wrap' } });

  await waitFor(() => {
    expect(screen.queryByText('Test Burger')).not.toBeInTheDocument();
    expect(screen.getByText('Test Wrap')).toBeInTheDocument();
  });

  // Clear button works
  const clearBtn = screen.getByLabelText(/Clear search/i);
  fireEvent.click(clearBtn);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());
});

test('category pills filter menu', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const burgersPill = screen.getByRole('tab', { name: /Burgers/i });
  fireEvent.click(burgersPill);

  await waitFor(() => {
    expect(screen.getByText('Test Burger')).toBeInTheDocument();
    expect(screen.queryByText('Test Wrap')).not.toBeInTheDocument();
  });

  const allPill = screen.getByRole('tab', { name: /All/i });
  fireEvent.click(allPill);
  await waitFor(() => expect(screen.getByText('Test Wrap')).toBeInTheDocument());
});

test('language switcher changes displayed item names', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const hiBtn = screen.getByRole('button', { name: 'HI' });
  fireEvent.click(hiBtn);

  await waitFor(() => expect(screen.getByText('टेस्ट बर्गर')).toBeInTheDocument());
});

test('add simple item to cart shows floating cart button with correct count/price', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const addBtn = screen.getByLabelText('Add Test Burger to cart');
  fireEvent.click(addBtn);

  await waitFor(() => {
    const cartFloat = document.querySelector('.cart-float__price');
    expect(cartFloat).toHaveTextContent('₹99');
  });
});

test('variant item: expand and add specific variant to cart', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Wrap')).toBeInTheDocument());

  // Expand variants
  const wrapToggle = screen.getByLabelText('Test Wrap');
  fireEvent.click(wrapToggle);

  const addLarge = await screen.findByLabelText('Add Large');
  fireEvent.click(addLarge);

  await waitFor(() => {
    const cartFloat = document.querySelector('.cart-float__price');
    expect(cartFloat).toHaveTextContent('₹120');
  });
});

test('cart modal: open, change quantity, see updated totals', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  await flushPromises();

  // Open cart via floating button
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  expect(within(modal).getByText('Test Burger')).toBeInTheDocument();
  expect(within(modal).getByText('₹99 each')).toBeInTheDocument();

  // Increase quantity
  const incBtn = within(modal).getByLabelText('Increase quantity');
  fireEvent.click(incBtn);

  await waitFor(() => {
    const lineTotal = within(modal).getByText('₹198', { selector: '.cart-item__total' });
    expect(lineTotal).toBeInTheDocument();
  });

  // Grand total row should reflect 198 (subtotal, no delivery for pickup)
  expect(within(modal).getByText('₹198', { selector: '.cart-summary__total-price' })).toBeInTheDocument();

  // Decrease back to 1, then to 0 removes item
  fireEvent.click(within(modal).getByLabelText('Decrease quantity'));
  fireEvent.click(within(modal).getByLabelText('Decrease quantity'));

  await waitFor(() => {
    expect(within(modal).queryByText('Test Burger')).not.toBeInTheDocument();
    expect(within(modal).getByText(/Cart is empty/i)).toBeInTheDocument();
  });
});

test('cart modal: close button closes the modal', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  fireEvent.click(within(modal).getByLabelText('Close cart'));

  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Your cart/i })).not.toBeInTheDocument());
});

test('checkout without login redirects to profile tab with warning', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('Add Test Burger to cart'));
  const cartFloatBtn = await screen.findByText(/View Cart/i);
  fireEvent.click(cartFloatBtn);

  const modal = await screen.findByRole('dialog', { name: /Your cart/i });
  const checkoutBtn = within(modal).getByRole('button', { name: /Checkout/i });
  fireEvent.click(checkoutBtn);

  await waitFor(() => {
    expect(screen.getByText(/Please log in to place an order/i)).toBeInTheDocument();
  });
  // Should switch to profile tab (Login form visible)
  await waitFor(() => expect(screen.getByText(/Welcome to Brown Booys/i)).toBeInTheDocument());
});

test('bottom nav switches tabs', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const ordersTab = screen.getByRole('button', { name: /Open cart/i }); // sanity check exists
  expect(ordersTab).toBeInTheDocument();

  const ordersBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Orders');
  fireEvent.click(ordersBtn.closest('button'));

  await waitFor(() => expect(screen.getByText(/My Orders/i)).toBeInTheDocument());
  // Not logged in -> prompt to log in
  expect(screen.getByText(/Please log in to view your orders/i)).toBeInTheDocument();

  const profileBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Profile');
  fireEvent.click(profileBtn.closest('button'));
  await waitFor(() => expect(screen.getByText(/Welcome to Brown Booys/i)).toBeInTheDocument());
});

test('login flow: invalid phone shows error, valid phone logs in and persists', async () => {
  global.fetch = mockFetchDefault();
  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const profileBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Profile');
  fireEvent.click(profileBtn.closest('button'));

  const phoneInput = await screen.findByLabelText(/Phone Number/i);
  fireEvent.change(phoneInput, { target: { value: '123' } }); // too short

  const continueBtn = screen.getByRole('button', { name: /Continue/i });
  fireEvent.click(continueBtn);

  await waitFor(() => expect(screen.getByText(/valid 10-digit phone number/i)).toBeInTheDocument());

  fireEvent.change(phoneInput, { target: { value: '9876543210' } });
  fireEvent.click(continueBtn);

  await waitFor(() => {
    expect(localStorage.getItem('userId')).toBe('9876543210');
  });

  // Profile page should now show logged-in view
  await waitFor(() => expect(screen.getByText(/📞 9876543210/i)).toBeInTheDocument());
});

test('shop closed banner shows when shopOpen=false', async () => {
  global.fetch = mockFetchDefault({ shop: { ...SHOP, shopOpen: false } });
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/We're currently closed/i)).toBeInTheDocument();
  });
});

test('orders tab shows existing orders when logged in', async () => {
  const orders = [
    { _id: 'abc123456', items: [{ name: 'Test Burger', qty: 2, price: 99 }], total: 198, status: 'Preparing', orderType: 'pickup', date: '13 Jun 2026', time: '10:00 AM' },
  ];
  global.fetch = mockFetchDefault({ orders });
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const ordersBtn = within(screen.getByRole('navigation', { name: /Bottom navigation/i })).getByText('Orders');
  fireEvent.click(ordersBtn.closest('button'));

  await waitFor(() => {
    expect(screen.getByText(/#123456/)).toBeInTheDocument();
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getByText('₹198', { selector: '.order-card__total' })).toBeInTheDocument();
  });
});

test('offer banner falls back to static when no offers returned', async () => {
  global.fetch = mockFetchDefault({ offers: [] });
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/Free delivery on orders/i)).toBeInTheDocument();
  });
});

test('offer banner renders live offer with title/subtitle', async () => {
  global.fetch = mockFetchDefault({ offers: [{ _id: 'o1', imageUrl: 'https://example.com/banner.jpg', title: 'Weekend Special', subtitle: '20% off everything' }] });
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('Weekend Special')).toBeInTheDocument();
    expect(screen.getByText('20% off everything')).toBeInTheDocument();
  });
});

test('logout clears user and cart-independent state', async () => {
  global.fetch = mockFetchDefault();
  localStorage.setItem('userId', '9876543210');
  localStorage.setItem('userName', 'Test User');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Test Burger')).toBeInTheDocument());

  const logoutBtn = screen.getByLabelText('Logout');
  fireEvent.click(logoutBtn);

  await waitFor(() => {
    expect(localStorage.getItem('userId')).toBeNull();
  });
});
