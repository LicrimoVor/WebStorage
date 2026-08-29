import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {employeeFixture} from '@/entities/Employee/testing';
import type * as WorkPayrollExports from '@/entities/WorkPayroll';
import {
  createEmployeePayment,
  useEmployeeWorkEntriesQuery,
} from '@/entities/WorkPayroll';
import {paymentFixture} from '@/entities/WorkPayroll/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {RegisterPaymentButton} from './RegisterPaymentButton';

vi.mock('@/entities/WorkPayroll', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkPayrollExports>();
  return {
    ...actual,
    createEmployeePayment: vi.fn(),
    useEmployeeWorkEntriesQuery: vi.fn(),
  };
});

describe('RegisterPaymentButton', () => {
  beforeEach(() => {
    vi.mocked(useEmployeeWorkEntriesQuery).mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useEmployeeWorkEntriesQuery>);
    vi.mocked(createEmployeePayment).mockResolvedValue(paymentFixture);
  });

  it('submits FIFO payment by default', async () => {
    const user = userEvent.setup();
    const employee = {...employeeFixture, payable_total: '20.00'};
    renderWithProviders(<RegisterPaymentButton employee={employee} />);

    await user.click(screen.getByRole('button', {name: 'Выплатить'}));
    await user.click(screen.getByRole('button', {name: 'Провести выплату'}));

    await waitFor(() =>
      expect(createEmployeePayment).toHaveBeenCalledWith(
        employee.id,
        expect.objectContaining({amount: '20.00', allocations: null}),
      ),
    );
  });
});
