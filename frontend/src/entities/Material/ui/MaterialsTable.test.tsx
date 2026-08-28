import {screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {materialFixture} from '../testing';
import {MaterialsTable} from './MaterialsTable';

describe('MaterialsTable', () => {
  it('renders all material columns and actions', () => {
    renderWithProviders(
      <MaterialsTable
        items={[materialFixture]}
        renderActions={() => <button type="button">Действие</button>}
      />,
    );

    expect(screen.getByText('Лист стали')).toBeInTheDocument();
    expect(screen.getByText('10,5')).toBeInTheDocument();
    expect(screen.getByText('125,4 ₽')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Открыть'})).toHaveAttribute(
      'href',
      'https://example.com/steel',
    );
    expect(screen.getByRole('button', {name: 'Действие'})).toBeInTheDocument();
  });
});
