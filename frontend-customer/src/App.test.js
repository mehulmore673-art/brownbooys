import { render } from '@testing-library/react';
import App from './App';

// FIX — original test searched for "learn react" text which doesn't
// exist in this app and always failed. Replaced with a basic smoke
// test that the app renders without throwing.
test('renders app without crashing', () => {
  render(<App />);
});
