import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminPanel from '../AdminPanel';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  if (!global.URL.createObjectURL) global.URL.createObjectURL = jest.fn(() => 'blob:mock');
});

function installAudioContextMock() {
  const oscillators = [];
  class MockOscillator { constructor() { this.frequency = { value: 0 }; this.type = ''; this._started = false; } connect() {} start() { this._started = true; } stop() {} }
  class MockGain { constructor() { this.gain = { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() }; } connect() {} }
  class MockAudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { const o = new MockOscillator(); oscillators.push(o); return o; }
    createGain() { return new MockGain(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  global.window.AudioContext = MockAudioContext;
  return { oscillators };
}

function basicMock() {
  return jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/orders?admin=true')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/menu')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5 }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

test('clicking Sound button plays a test beep immediately', async () => {
  const { oscillators } = installAudioContextMock();
  global.fetch = basicMock();
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();

  const soundBtn = await screen.findByRole('button', { name: /🔔 Sound/i });
  fireEvent.click(soundBtn);

  await waitFor(() => {
    expect(oscillators.length).toBeGreaterThanOrEqual(2);
  });
  expect(oscillators.every(o => o._started)).toBe(true);
});

test('clicking Sound button while muted unmutes AND plays the test beep', async () => {
  const { oscillators } = installAudioContextMock();
  global.fetch = basicMock();
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();

  // Mute first
  const muteBtn = await screen.findByRole('button', { name: /^Mute$/i });
  fireEvent.click(muteBtn);
  await waitFor(() => expect(screen.getByRole('button', { name: /Unmute/i })).toBeInTheDocument());

  // Now click Sound while muted
  const soundBtn = screen.getByRole('button', { name: /🔇 Muted/i });
  fireEvent.click(soundBtn);

  // Should have unmuted
  await waitFor(() => expect(screen.getByText(/🔔 Sound/i)).toBeInTheDocument());

  // And should have played the test beep
  await waitFor(() => {
    expect(oscillators.length).toBeGreaterThanOrEqual(2);
  });
});

test('separate Mute button toggles mute without playing sound', async () => {
  const { oscillators } = installAudioContextMock();
  global.fetch = basicMock();
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();

  const muteBtn = await screen.findByRole('button', { name: /^Mute$/i });
  fireEvent.click(muteBtn);

  await waitFor(() => expect(screen.getByRole('button', { name: /Unmute/i })).toBeInTheDocument());
  // Muting itself should not have played any sound
  expect(oscillators.length).toBe(0);
});
