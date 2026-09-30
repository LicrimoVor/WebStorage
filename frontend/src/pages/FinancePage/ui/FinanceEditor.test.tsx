import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {FinanceEditor} from './FinanceEditor';

vi.mock('@/entities/Funding', () => ({FundingSelect: () => <span>Счёт</span>, useFundingSources: () => ({data: [{id: 'source', name: 'Основной'}]})}));
vi.mock('@/entities/Funding/api', () => ({useFundingSources: () => ({data: [{id: 'source', name: 'Основной'}]})}));
vi.mock('@/shared/api', () => ({getErrorMessage: () => 'Ошибка', apiRequest: vi.fn(async (_path, options) => {
  if (options?.method === 'PATCH') return {};
  return {entry: {id: 'entry', amount: '100.00', occurred_at: '2026-09-30T10:00:00Z', funding_source_id: 'source', funding_allocations: [], comment: 'Old', created_by: 'admin', source_type: 'manual', category: 'Материалы', description: 'Закупка'}, revision: 2, history: []};
})}));

it('loads the full amount and submits the revision and mandatory reason', async () => {
  renderWithProviders(<FinanceEditor id="entry" onClose={vi.fn()} />);
  const amount = await screen.findByLabelText('Сумма, ₽');
  expect(amount).toHaveValue('100.00');
  expect(screen.getByRole('button', {name: 'Сохранить'})).toBeDisabled();
  fireEvent.change(amount, {target: {value: '120,50'}});
  fireEvent.change(screen.getByLabelText('Причина изменения'), {target: {value: 'Исправление накладной'}});
  await userEvent.click(screen.getByRole('button', {name: 'Сохранить'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/finance/entries/entry', expect.objectContaining({method: 'PATCH'})));
  const request = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({amount: '120.50', revision: 2, reason: 'Исправление накладной', funding_source_id: 'source'});
});
