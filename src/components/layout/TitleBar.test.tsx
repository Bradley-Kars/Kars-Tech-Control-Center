import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TitleBar } from './TitleBar';

describe('TitleBar', () => {
  it('renders', () => {
    const { container } = render(<TitleBar />);
    expect(container).toBeInTheDocument();
  });
});
