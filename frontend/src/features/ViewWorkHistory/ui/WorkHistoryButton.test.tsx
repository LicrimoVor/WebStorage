import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type * as WorkPayrollExports from '@/entities/WorkPayroll';
import {
  updateWorkEntry,
  useEmployeeWorkEntriesQuery,
  useOperationWorkEntriesQuery,
} from '@/entities/WorkPayroll';
import {workEntryFixture} from '@/entities/WorkPayroll/testing';
import {operationFixture} from '@/entities/Operation/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {WorkHistoryButton} from './WorkHistoryButton';

vi.mock('@/entities/WorkPayroll', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkPayrollExports>();
  return {
    ...actual,
    updateWorkEntry: vi.fn(),
    useOperationWorkEntriesQuery: vi.fn(),
    useEmployeeWorkEntriesQuery: vi.fn(),
  };
});

const historyResult = {
  data: {items: [workEntryFixture], page: 1, page_size: 10, total: 1, pages: 1},
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

describe('WorkHistoryButton', () => {
  beforeEach(() => {
    vi.mocked(useOperationWorkEntriesQuery).mockReturnValue(
      historyResult as unknown as ReturnType<typeof useOperationWorkEntriesQuery>,
    );
    vi.mocked(useEmployeeWorkEntriesQuery).mockReturnValue(
      historyResult as unknown as ReturnType<typeof useEmployeeWorkEntriesQuery>,
    );
    vi.mocked(updateWorkEntry).mockResolvedValue(workEntryFixture);
  });

  it('shows work history and edits an unpaid entry', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WorkHistoryButton operation={operationFixture} />);

    await user.click(screen.getByRole('button', {name: 'История работ'}));
    expect(screen.getByText(workEntryFixture.employee_name)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Изменить'}));
    const input = screen.getByLabelText('Объём работы');
    await user.clear(input);
    await user.type(input, '3,5');
    await user.click(await screen.findByRole('button', {name: 'Сохранить'}));

    await waitFor(() =>
      expect(updateWorkEntry).toHaveBeenCalledWith(
        workEntryFixture.id,
        expect.objectContaining({input_value: '3.5', input_mode: 'quantity'}),
      ),
    );
  });
});
