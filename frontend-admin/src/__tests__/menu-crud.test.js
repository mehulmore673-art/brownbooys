import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminPanel from '../AdminPanel';

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
  if (!global.URL.createObjectURL) global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = jest.fn();
});

function baseMock(calls, menuItems = []) {
  return jest.fn((url, opts) => {
    const u = String(url);
    const method = opts?.method || 'GET';
    calls.push({ url: u, method, body: opts?.body });

    if (u.includes('/api/orders?admin=true')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/menu') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, id: 99 }) });
    if (u.includes('/api/menu') && method === 'PUT') return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
    if (u.includes('/api/menu') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => menuItems });
    if (u.includes('/api/shop')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ shopOpen: true, deliveryOn: true, freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5, shopLatitude: 0, shopLongitude: 0 }) });
    if (u.includes('/api/orders/analytics')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ todayOrders: 0, todayRevenue: 0, totalOrders: 0, totalRevenue: 0 }) });
    if (u.includes('/api/offers/all')) return Promise.resolve({ ok: true, status: 200, json: async () => ([]) });
    if (u.includes('/api/upload')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ url: 'https://res.cloudinary.com/test/image/upload/v1/test.jpg' }) });

    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

test('ADD ITEM: full payload sent to /api/menu matches what the backend expects', async () => {
  const calls = [];
  global.fetch = baseMock(calls);
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();

  const menuTabBtn = await screen.findByRole('button', { name: /Menu/i });
  fireEvent.click(menuTabBtn);
  await flushPromises();

  const addBtn = await screen.findByRole('button', { name: /\+ Add Item/i });
  fireEvent.click(addBtn);
  await flushPromises();

  fireEvent.change(screen.getByPlaceholderText(/english/i), { target: { value: 'New Burger' } });
  const priceInputs = screen.getAllByRole('spinbutton');
  fireEvent.change(priceInputs[0], { target: { value: '149' } });

  const fileInputs = document.querySelectorAll('input[type="file"]');
  const file = new File(['dummy'], 'burger.jpg', { type: 'image/jpeg' });
  Object.defineProperty(fileInputs[0], 'files', { value: [file] });
  fireEvent.change(fileInputs[0]);
  await flushPromises();

  fireEvent.click(screen.getByRole('button', { name: /Add to Menu/i }));

  await waitFor(() => {
    const menuPost = calls.find(c => c.url.includes('/api/menu') && c.method === 'POST');
    expect(menuPost).toBeDefined();
    const payload = JSON.parse(menuPost.body);
    expect(payload.title.en).toBe('New Burger');
    expect(payload.price).toBe(149);
    expect(payload.image).toBe('https://res.cloudinary.com/test/image/upload/v1/test.jpg');
    expect(payload.available).toBe(true);
  });

  // Upload must have happened BEFORE the menu POST
  const uploadCallIndex = calls.findIndex(c => c.url.includes('/api/upload'));
  const menuPostIndex = calls.findIndex(c => c.url.includes('/api/menu') && c.method === 'POST');
  expect(uploadCallIndex).toBeGreaterThanOrEqual(0);
  expect(uploadCallIndex).toBeLessThan(menuPostIndex);
});

test('EDIT ITEM: clicking edit pre-fills the form with existing item data', async () => {
  const calls = [];
  const existingItem = {
    id: 5, title: { en: 'Existing Wrap', hi: 'मौजूदा रैप', gu: 'હાલની રેપ' },
    description: 'Tasty wrap', price: 90, image: 'https://res.cloudinary.com/test/old.jpg',
    isVeg: true, available: true,
  };
  global.fetch = baseMock(calls, [existingItem]);
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();

  const menuTabBtn = await screen.findByRole('button', { name: /Menu/i });
  fireEvent.click(menuTabBtn);
  await flushPromises();

  await waitFor(() => expect(screen.getByText('Existing Wrap')).toBeInTheDocument());

  const editBtn = screen.getByRole('button', { name: '✏️' });
  fireEvent.click(editBtn);

  await waitFor(() => {
    expect(screen.getByText(/Editing: Existing Wrap/i)).toBeInTheDocument();
  });

  // Name field should be pre-filled
  const nameInputs = screen.getAllByDisplayValue('Existing Wrap');
  expect(nameInputs.length).toBeGreaterThan(0);

  // Price should be pre-filled
  expect(screen.getByDisplayValue('90')).toBeInTheDocument();
});

test('EDIT ITEM: saving changes sends correct PUT payload to /api/menu/:id', async () => {
  const calls = [];
  const existingItem = {
    id: 5, title: { en: 'Existing Wrap', hi: 'मौजूदा रैप', gu: 'હાલની રેપ' },
    description: 'Tasty wrap', price: 90, image: 'https://res.cloudinary.com/test/old.jpg',
    isVeg: true, available: true,
  };
  global.fetch = baseMock(calls, [existingItem]);
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();

  const menuTabBtn = await screen.findByRole('button', { name: /Menu/i });
  fireEvent.click(menuTabBtn);
  await flushPromises();
  await waitFor(() => expect(screen.getByText('Existing Wrap')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: '✏️' }));
  await waitFor(() => expect(screen.getByText(/Editing: Existing Wrap/i)).toBeInTheDocument());

  // Change the price
  const priceInput = screen.getByDisplayValue('90');
  fireEvent.change(priceInput, { target: { value: '110' } });

  // Change the English name
  const nameInput = screen.getAllByDisplayValue('Existing Wrap')[0];
  fireEvent.change(nameInput, { target: { value: 'Updated Wrap' } });

  fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

  await waitFor(() => {
    const putCall = calls.find(c => c.url.includes('/api/menu/5') && c.method === 'PUT');
    expect(putCall).toBeDefined();
    const payload = JSON.parse(putCall.body);
    expect(payload.title.en).toBe('Updated Wrap');
    expect(payload.price).toBe(110);
  });
});

test('EDIT ITEM: can upload a new image FILE (not just paste a URL)', async () => {
  const calls = [];
  const existingItem = {
    id: 5, title: { en: 'Existing Wrap', hi: 'x', gu: 'x' },
    price: 90, image: 'https://res.cloudinary.com/test/old.jpg', available: true,
  };
  global.fetch = baseMock(calls, [existingItem]);
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();
  fireEvent.click(await screen.findByRole('button', { name: /Menu/i }));
  await flushPromises();
  await waitFor(() => expect(screen.getByText('Existing Wrap')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: '✏️' }));
  await waitFor(() => expect(screen.getByText(/Editing: Existing Wrap/i)).toBeInTheDocument());

  // File input should now exist in the edit form
  const fileInputs = document.querySelectorAll('input[type="file"]');
  expect(fileInputs.length).toBeGreaterThan(0);

  const file = new File(['dummy'], 'new-photo.jpg', { type: 'image/jpeg' });
  Object.defineProperty(fileInputs[0], 'files', { value: [file] });
  fireEvent.change(fileInputs[0]);
  await flushPromises();

  expect(screen.getByText(/new-photo.jpg selected/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

  await waitFor(() => {
    const uploadCall = calls.find(c => c.url.includes('/api/upload'));
    expect(uploadCall).toBeDefined();
  });

  await waitFor(() => {
    const putCall = calls.find(c => c.url.includes('/api/menu/5') && c.method === 'PUT');
    const payload = JSON.parse(putCall.body);
    // Should use the uploaded file's returned Cloudinary URL, not the old image
    expect(payload.image).toBe('https://res.cloudinary.com/test/image/upload/v1/test.jpg');
  });

  // Upload must happen before the PUT
  const uploadIdx = calls.findIndex(c => c.url.includes('/api/upload'));
  const putIdx = calls.findIndex(c => c.url.includes('/api/menu/5') && c.method === 'PUT');
  expect(uploadIdx).toBeGreaterThanOrEqual(0);
  expect(uploadIdx).toBeLessThan(putIdx);
});

test('EDIT ITEM: leaving image fields untouched keeps the existing image', async () => {
  const calls = [];
  const existingItem = {
    id: 5, title: { en: 'Existing Wrap', hi: 'x', gu: 'x' },
    price: 90, image: 'https://res.cloudinary.com/test/old.jpg', available: true,
  };
  global.fetch = baseMock(calls, [existingItem]);
  localStorage.setItem('adminToken', 'mock.jwt.token');

  render(<AdminPanel />);
  await flushPromises();
  fireEvent.click(await screen.findByRole('button', { name: /Menu/i }));
  await flushPromises();
  await waitFor(() => expect(screen.getByText('Existing Wrap')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: '✏️' }));
  await waitFor(() => expect(screen.getByText(/Editing: Existing Wrap/i)).toBeInTheDocument());

  // Don't touch the image fields at all, just save as-is
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

  await waitFor(() => {
    const putCall = calls.find(c => c.url.includes('/api/menu/5') && c.method === 'PUT');
    const payload = JSON.parse(putCall.body);
    expect(payload.image).toBe('https://res.cloudinary.com/test/old.jpg');
  });

  // No upload call should have happened since no file was selected
  const uploadCall = calls.find(c => c.url.includes('/api/upload'));
  expect(uploadCall).toBeUndefined();
});

test('DELETE ITEM: confirms then sends DELETE to /api/menu/:id', async () => {
  const calls = [];
  const existingItem = { id: 7, title: { en: 'To Delete' }, price: 50, available: true };
  global.fetch = baseMock(calls, [existingItem]);
  localStorage.setItem('adminToken', 'mock.jwt.token');
  window.confirm = jest.fn(() => true);

  render(<AdminPanel />);
  await flushPromises();
  fireEvent.click(await screen.findByRole('button', { name: /Menu/i }));
  await flushPromises();
  await waitFor(() => expect(screen.getByText('To Delete')).toBeInTheDocument());

  const deleteBtn = screen.getByRole('button', { name: '🗑️' });
  fireEvent.click(deleteBtn);

  await waitFor(() => {
    expect(window.confirm).toHaveBeenCalled();
    const delCall = calls.find(c => c.url.includes('/api/menu/7') && c.method === 'DELETE');
    expect(delCall).toBeDefined();
  });
});
