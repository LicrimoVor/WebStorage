import {screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {employeeFixture} from '@/entities/Employee/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {EmployeeDetails} from './EmployeeDetails';

vi.mock('@/shared/api', () => ({apiRequest: vi.fn(async () => employeeFixture), getErrorMessage: () => 'Ошибка'}));

it('shows employee fields and opens actions in the card', async () => {
  renderWithProviders(<EmployeeDetails id={employeeFixture.id} onClose={vi.fn()} renderActions={() => <button>Выплатить</button>} />);
  expect(await screen.findByText(employeeFixture.full_name)).toBeVisible();
  expect(screen.getByText('Ставка в час')).toBeVisible();
  expect(screen.getByRole('button', {name: 'Выплатить'})).toBeVisible();
});
