import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import userEvent from '@testing-library/user-event';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {operationFixture} from '../testing';
import {OperationsTable} from './OperationsTable';

describe('OperationsTable', () => {
  it('opens a card and does not render an actions column', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <OperationsTable
        items={[operationFixture]}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('Сверление')).toBeInTheDocument();
    expect(screen.getByText('3,5 мин.')).toBeInTheDocument();
    expect(screen.getByText('12,4 ₽')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', {name: 'Действия'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Сверление'}));
    expect(onSelect).toHaveBeenCalledWith(operationFixture);
  });
});
