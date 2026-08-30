import {screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {manufacturedItemFixture} from '../testing';
import {ManufacturedItemsTable} from './ManufacturedItemsTable';

describe('ManufacturedItemsTable', () => {
  it('renders stock and future process columns', () => {
    renderWithProviders(
      <ManufacturedItemsTable
        items={[manufacturedItemFixture]}
        renderActions={() => <button type="button">Действие</button>}
      />,
    );

    expect(screen.getByText('Корпус редуктора')).toBeInTheDocument();
    expect(screen.getByText('4,5')).toBeInTheDocument();
    expect(screen.getByText('Состав')).toBeInTheDocument();
    expect(screen.getByText('Операции')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Действие'})).toBeInTheDocument();
  });
});
