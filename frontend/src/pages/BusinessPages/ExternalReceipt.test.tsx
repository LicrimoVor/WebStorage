import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import type * as ApiModule from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ExternalReceipt} from './ExternalReceipt';

vi.mock('@/entities/External', () => ({externalKeys: ['externals'], useExternalOffersQuery: () => ({data: [
  {id: 'offer', provider_id: 'provider', provider_name: 'Подрядчик', item_id: 'semi', item_name: 'Узел', unit: 'шт', operation_id: 'operation', money_cost: '12.50', materials: [{material_id: 'steel', quantity: '2.25'}], active: true},
  {id: 'inactive', provider_name: 'Неактивный', item_name: 'Скрытый', active: false},
]})}));
vi.mock('@/entities/Material', () => ({useMaterialsQuery: () => ({data: {items: [{id: 'steel', name: 'Сталь', unit: 'кг'}]}})}));
vi.mock('@/entities/Funding', () => ({useFundingSources: () => ({data: []}), FundingSelect: ({onChange}: {onChange: (id: string) => void}) => <button onClick={() => onChange('source')}>Выбрать счёт</button>}));
vi.mock('@/shared/api', async (importOriginal) => ({...await importOriginal<typeof ApiModule>(), apiRequest: vi.fn(async () => [])}));

it('shows per-unit costs multiplied by quantity and submits one receipt command', async () => {
  renderWithProviders(<ExternalReceipt />);
  await userEvent.click(screen.getByRole('combobox', {name: 'Полуфабрикат извне'}));
  expect(screen.queryByRole('option', {name: 'Скрытый — Неактивный'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('option', {name: 'Узел — Подрядчик'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Количество внешнего полуфабриката'}), {target: {value: '3'}});
  expect(screen.getByText('37,5 ₽')).toBeInTheDocument();
  expect(screen.getByText('Сталь: 6,75 кг')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  await userEvent.click(screen.getByRole('button', {name: 'Получить извне'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/external-receipts', expect.objectContaining({method: 'POST'})));
  const request = vi.mocked(apiRequest).mock.calls.find(([path]) => path === '/external-receipts')!;
  expect(JSON.parse(String(request[1]?.body))).toMatchObject({offer_id: 'offer', quantity: '3', funding_source_id: 'source'});
  expect(request[1]?.headers).toMatchObject({'Idempotency-Key': expect.any(String)});
  await waitFor(() => expect(screen.getByText('Полуфабрикат оприходован, расходы записаны')).toBeInTheDocument());
});
