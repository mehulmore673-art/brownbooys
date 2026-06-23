import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminPanel from '../AdminPanel';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  if (!global.URL.createObjectURL) global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = jest.fn();
});

// Real Web Audio API mock (no fake timers — uses the component's real
// 3-second polling interval with short real waits instead).
function installAudioContextMock() {
  const oscillators = [];

  class MockOscillator {
    constructor() { this.frequency = { value: 0 }; this.type = ''; this._started = false; }
    connect() {}
    start(t) { this._started = true; }
    stop(t) {}
  }
  class MockGain {
    constructor() { this.gain = { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }; }
    connect() {}
  }
  class MockAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { const o = new MockOscillator(); oscillators.push(o); return o; }
    createGain() { return new MockGain(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }

  global.window.AudioContext = MockAudioContext;
  global.AudioContext = MockAudioContext;
  return { oscillators };
}

function mockFetchWithGrowingOrders() {
  let pollCount = 0;
  const baseOrder = { _id: 'order000001', items: [{ name: 'Test Item', qty: 1, price: 50 }], total: 50, status: 'Pending', orderType: 'pickup', createdAt: new Date().toISOString() };

  return jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/orders?admin=true')) {
      pollCount++;
      const orders = pollCount === 1
        ? [baseOrder]
        : [baseOrder, { ...baseOrder, _id: 'order000002', createdAt: new Date().toISOString() }];
      return Promise.resolve({ ok: true, status: 200, json: async () => orders });
    }
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 0, shopLongitude: 0 }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

test('sound actually plays (oscillators created+started) when order count increases between polls', async () => {
  const { oscillators } = installAudioContextMock();
  global.fetch = mockFetchWithGrowingOrders();
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();
  await flushPromises();

  expect(oscillators.length).toBe(0); // no beep on initial load

  // Simulate the admin clicking somewhere on the page (unlocks AudioContext)
  fireEvent.click(document.body);
  await flushPromises();

  // Wait past the real 3s polling interval for the second poll to fire
  await wait(3300);
  await flushPromises();

  await waitFor(() => {
    expect(screen.getByText(/new order/i)).toBeInTheDocument();
  }, { timeout: 5000 });

  await waitFor(() => {
    expect(oscillators.length).toBeGreaterThanOrEqual(2); // 2 tones per beep
  }, { timeout: 5000 });
  expect(oscillators.every(o => o._started)).toBe(true);
}, 20000);

test('sound does NOT play on initial load even if orders already exist', async () => {
  const { oscillators } = installAudioContextMock();

  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/orders?admin=true')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ([
        { _id: 'o1', items: [], total: 10, status: 'Pending', orderType: 'pickup', createdAt: new Date().toISOString() },
        { _id: 'o2', items: [], total: 20, status: 'Pending', orderType: 'pickup', createdAt: new Date().toISOString() },
      ]) });
    }
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5 }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  localStorage.setItem('adminToken', 'mock.jwt.token');
  render(<AdminPanel />);

  fireEvent.click(document.body);
  await flushPromises();
  await wait(3300);
  await flushPromises();

  expect(oscillators.length).toBe(0);
  expect(screen.queryByText(/new order/i)).not.toBeInTheDocument();
}, 20000);

test('mute button actually silences the beep (toast still shows)', async () => {
  const { oscillators } = installAudioContextMock();
  global.fetch = mockFetchWithGrowingOrders();
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();
  await flushPromises();

  fireEvent.click(document.body);
  await flushPromises();

  const muteBtn = await screen.findByRole('button', { name: /^Mute$/i });
  fireEvent.click(muteBtn);
  await waitFor(() => expect(screen.getByText(/Muted/i)).toBeInTheDocument());

  await wait(3300);
  await flushPromises();

  await waitFor(() => {
    expect(screen.getByText(/new order/i)).toBeInTheDocument();
  }, { timeout: 5000 });

  expect(oscillators.length).toBe(0);
}, 20000);
