import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {createEmployee} from '@/entities/Employee';
import type * as EmployeeExports from '@/entities/Employee';
import {employeeFixture} from '@/entities/Employee/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {CreateEmployeeButton} from './CreateEmployeeButton';

vi.mock('@/entities/Employee', async (importOriginal) => {
  const actual = await importOriginal<typeof EmployeeExports>();
  return {...actual, createEmployee: vi.fn()};
});

describe('CreateEmployeeButton', () => {
  it('creates an employee with a normalized comment', async () => {
    vi.mocked(createEmployee).mockResolvedValue(employeeFixture);
    const user = userEvent.setup();
    renderWithProviders(<CreateEmployeeButton />);
    await user.click(screen.getByRole('button', {name: 'Добавить сотрудника'}));
    await user.type(screen.getByLabelText('ФИО сотрудника'), 'Иванов Иван Иванович');
    await user.type(screen.getByLabelText('Комментарий сотрудника'), '  Участок 1  ');
    await user.click(screen.getByRole('button', {name: 'Добавить'}));
    await waitFor(() =>
      expect(createEmployee).toHaveBeenCalledWith({
        full_name: 'Иванов Иван Иванович',
        comment: 'Участок 1',
      }),
    );
  });
});
