import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type * as FinanceExports from '@/entities/Finance';
import {
  createFinancialTransaction,
  useFinanceEntriesQuery,
  useFinanceSummaryQuery,
} from '@/entities/Finance';
import {
  financeEntryFixture,
  financeSummaryFixture,
  financialTransactionFixture,
} from '@/entities/Finance/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {FinancePage} from './FinancePage';

vi.mock('@/entities/Finance', async (importOriginal) => {
  const actual = await importOriginal<typeof FinanceExports>();
  return {
    ...actual,
    createFinancialTransaction: vi.fn(),
    useFinanceEntriesQuery: vi.fn(),
    useFinanceSummaryQuery: vi.fn(),
  };
});

describe('FinancePage', () => {
  beforeEach(() => {
    vi.mocked(useFinanceEntriesQuery).mockReturnValue({
      data: {
        items: [financeEntryFixture],
        page: 1,
        page_size: 20,
        total: 1,
        pages: 1,
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useFinanceEntriesQuery>);
    vi.mocked(useFinanceSummaryQuery).mockReturnValue({
      data: financeSummaryFixture,
    } as unknown as ReturnType<typeof useFinanceSummaryQuery>);
    vi.mocked(createFinancialTransaction).mockResolvedValue(
      financialTransactionFixture,
    );
  });

  it('shows unified entries and creates a manual expense', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinancePage />, '/finance');
    expect(screen.getByText('Готовое изделие')).toBeInTheDocument();
    expect(screen.getByText('124,68 ₽')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Добавить операцию'}));
    await user.type(screen.getByLabelText('Сумма операции'), '30');
    await user.type(screen.getByLabelText('Категория операции'), 'Аренда');
    await user.click(screen.getByRole('button', {name: 'Провести'}));
    await waitFor(() =>
      expect(createFinancialTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_type: 'expense',
          amount: '30',
          category: 'Аренда',
        }),
      ),
    );
  });
});
