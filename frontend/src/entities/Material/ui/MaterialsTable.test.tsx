import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import userEvent from '@testing-library/user-event';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {materialFixture} from '../testing';
import {MaterialsTable} from './MaterialsTable';

describe('MaterialsTable', () => {
  it('opens a material without inline actions or pricing', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <MaterialsTable
        items={[materialFixture]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('Лист стали')).toBeInTheDocument();
    expect(screen.getByText('10,5')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', {name: 'Брак'})).not.toBeInTheDocument();
    for (const name of ['Цена', 'Ссылка', 'Единица', 'Действия']) {
      expect(screen.queryByRole('columnheader', {name})).not.toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', {name: 'Лист стали'}));
    expect(onSelect).toHaveBeenCalledWith(materialFixture);
  });
});
