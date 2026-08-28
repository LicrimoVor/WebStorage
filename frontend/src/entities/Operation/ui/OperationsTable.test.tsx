import {screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {operationFixture} from '../testing';
import {OperationsTable} from './OperationsTable';

describe('OperationsTable', () => {
  it('renders norms, rates and calculated placeholders', () => {
    renderWithProviders(
      <OperationsTable
        items={[operationFixture]}
        renderActions={() => <button type="button">Действие</button>}
      />,
    );
    expect(screen.getByText('Сверление')).toBeInTheDocument();
    expect(screen.getByText('3,5 мин.')).toBeInTheDocument();
    expect(screen.getByText('12,4 ₽')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Действие'})).toBeInTheDocument();
  });
});
