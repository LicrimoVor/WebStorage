import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import type * as ApiModule from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ReceiptPage} from './index';

vi.mock('@/entities/StockRevision', () => ({useStockRevisionRowsQuery: () => ({data: [
  {id: 'first', name: 'Сталь', current_quantity: '0', unit: 'кг', groups: []},
  {id: 'second', name: 'Медь', current_quantity: '0', unit: 'кг', groups: []},
  {id: 'third', name: 'Алюминий', current_quantity: '0', unit: 'кг', groups: []},
]})}));
vi.mock('@/entities/InventoryGroup', () => ({useInventoryGroupsQuery: () => ({data: []})}));
vi.mock('@/entities/Funding', () => ({
  useFundingSources: () => ({data: []}),
  FundingSelect: ({onChange}: {onChange: (value: string) => void}) => <button onClick={() => onChange('funding')}>Выбрать счёт</button>,
}));
vi.mock('@/shared/api', async (original) => ({...await original<typeof ApiModule>(), apiRequest: vi.fn(async () => [])}));

it('submits only received materials with a single total and no unit prices', async () => {
  renderWithProviders(<ReceiptPage />);
  expect(screen.queryByText('Цена за единицу')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Сумма за приход'}), {target: {value: '123,45'}});
  fireEvent.change(screen.getByRole('textbox', {name: 'Приход: Сталь'}), {target: {value: '10'}});
  fireEvent.change(screen.getByRole('textbox', {name: 'Приход: Медь'}), {target: {value: '0'}});
  await userEvent.click(screen.getByRole('button', {name: 'Провести приход'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/warehouse/receipts', expect.objectContaining({method: 'POST'})));
  const request = vi.mocked(apiRequest).mock.calls.find(([path]) => path === '/warehouse/receipts');
  expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
    total_amount: '123.45', entries: [{material_id: 'first', quantity: '10'}],
  });
  expect(String(request?.[1]?.body)).not.toContain('unit_price');
});
