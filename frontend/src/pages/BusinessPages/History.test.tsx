import {screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {History} from './History';

const document = {
  id: 'repair-1', serial_number: 'N1', replacement_serial_number: 'N2',
  occurred_at: '2026-09-17T12:00:00Z', comment: 'Замена корпуса', funding_source_id: 'fund-1',
  materials: [{material_id: 'm1', quantity: '2'}],
  material_costs: [{material_id: 'm1', name: 'Корпус на дату ремонта', quantity: '2'}],
  operations: [{operation_id: 'o1', quantity: '1'}],
  operation_snapshots: [{name: 'Сборка', quantity: '1', rate: '100'}], service_cost: '100',
};
vi.mock('@/shared/api', () => ({
  apiRequest: vi.fn(async () => [document]),
  getErrorMessage: () => 'Ошибка',
}));
vi.mock('@/entities/Funding', () => ({useFundingSources: () => ({data: [{id: 'fund-1', name: 'Основной счёт'}]})}));
vi.mock('@/entities/StockRevision', () => ({useStockRevisionRowsQuery: () => ({data: []})}));

it('opens a repair in a dialog and copies the selected document back to the form', async () => {
  const onCopy = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<History kind="repair" onCopy={onCopy} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(await screen.findByRole('button', {name: 'Открыть ремонт N1'}, {timeout: 5000}));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('N2')).toBeInTheDocument();
  expect(within(dialog).getByText('Основной счёт')).toBeInTheDocument();
  expect(within(dialog).getByText(/Корпус на дату ремонта/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Сборка/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', {name: 'Создать похожий ремонт'}));
  expect(onCopy).toHaveBeenCalledWith(document);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
