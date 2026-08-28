import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {createOperation} from '@/entities/Operation';
import type * as OperationExports from '@/entities/Operation';
import {operationFixture} from '@/entities/Operation/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {CreateOperationButton} from './CreateOperationButton';

vi.mock('@/entities/Operation', async (importOriginal) => {
  const actual = await importOriginal<typeof OperationExports>();
  return {...actual, createOperation: vi.fn()};
});

describe('CreateOperationButton', () => {
  it('creates an operation with decimal strings', async () => {
    vi.mocked(createOperation).mockResolvedValue(operationFixture);
    const user = userEvent.setup();
    renderWithProviders(<CreateOperationButton />);
    await user.click(screen.getByRole('button', {name: 'Создать операцию'}));
    await user.type(screen.getByLabelText('Название операции'), 'Сверление');
    await user.type(screen.getByLabelText('Норма времени операции'), '3,5');
    await user.type(screen.getByLabelText('Ставка за операцию'), '12,40');
    await user.click(screen.getByRole('button', {name: 'Создать'}));
    await waitFor(() =>
      expect(createOperation).toHaveBeenCalledWith({
        name: 'Сверление',
        time_norm: '3.5',
        price_per_operation: '12.40',
      }),
    );
  });
});
