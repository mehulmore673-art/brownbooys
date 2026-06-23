import { render } from '@testing-library/react';
import AdminPanel from './AdminPanel';

test('renders admin panel without crashing', () => {
  render(<AdminPanel />);
});
