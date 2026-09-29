import userEvent from '@testing-library/user-event';
import {screen, within} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {operationFixture} from '@/entities/Operation/testing';
import {OperationDetails} from './OperationDetails';

vi.mock('@/entities/OperationGroup/api', async (original) => {
  const module = await original<Record<string, unknown>>();
  return {...module, useOperationGroupsQuery: () => ({data: [
    {id: 'parent', name: 'Обработка', parent_id: null},
    {id: 'child', name: 'Разное', parent_id: 'parent'},
  ]})};
});
vi.mock('@/shared/api', () => ({apiRequest: vi.fn(async () => ({...operationFixture, group_id: 'child'})), getErrorMessage: () => 'Ошибка'}));

it('shows operation fields, full group path and actions inside its card', async () => {
  renderWithProviders(<OperationDetails id={operationFixture.id} onClose={vi.fn()} renderActions={() => <button>Работа</button>} />);
  const dialog = screen.getByRole('dialog');
  expect(await within(dialog).findByText('Обработка / Разное')).toBeInTheDocument();
  expect(within(dialog).getByText('12,4 ₽')).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', {name: 'Действия'}));
  expect(screen.getByRole('button', {name: 'Работа'})).toBeInTheDocument();
});
