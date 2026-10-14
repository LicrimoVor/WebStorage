import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it, vi} from 'vitest';
import {saveExternalOffer, saveExternalProvider} from '@/entities/External';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ExternalProviders} from './ExternalProviders';

vi.mock('@/entities/External', () => ({externalKeys: ['externals'],
  useExternalProvidersQuery: () => ({data: [{id: 'provider', name: 'Подрядчик'}]}),
  useExternalOffersQuery: () => ({data: []}), saveExternalOffer: vi.fn(), saveExternalProvider: vi.fn(),
}));
vi.mock('@/entities/ManufacturedItem', () => ({useManufacturedItemsQuery: () => ({data: {items: [{id: 'semi', name: 'Узел', unit: 'шт'}]}})}));
vi.mock('@/entities/Material', () => ({useMaterialsQuery: () => ({data: {items: [{id: 'steel', name: 'Сталь', unit: 'кг'}]}})}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveExternalProvider).mockResolvedValue({id: 'new', name: 'Новый подрядчик'});
  vi.mocked(saveExternalOffer).mockResolvedValue({id: 'offer', operation_id: 'op', provider_id: 'provider', provider_name: 'Подрядчик', item_id: 'semi', item_name: 'Узел', unit: 'шт', money_cost: '12.5', materials: [{material_id: 'steel', quantity: '2.25'}], active: true});
});

it('creates a named external provider independently of employees', async () => {
  renderWithProviders(<ExternalProviders />);
  await userEvent.click(screen.getByRole('button', {name: 'Добавить внешнего'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Название внешнего исполнителя'}), {target: {value: 'Новый подрядчик'}});
  await userEvent.click(screen.getByRole('button', {name: 'Сохранить'}));
  await waitFor(() => expect(saveExternalProvider).toHaveBeenCalledWith('Новый подрядчик', undefined));
});

it('attaches a semi-finished item with money and material costs per unit', async () => {
  renderWithProviders(<ExternalProviders />);
  await userEvent.click(screen.getByRole('button', {name: 'Настроить п/ф'}));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  await userEvent.click(screen.getByRole('combobox', {name: 'Внешний полуфабрикат'}));
  await userEvent.click(await screen.findByRole('option', {name: 'Узел'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Стоимость внешнего полуфабриката'}), {target: {value: '12,5'}});
  await userEvent.click(screen.getByRole('combobox', {name: 'Материал для внешнего исполнителя'}));
  await userEvent.click(await screen.findByRole('option', {name: 'Сталь'}));
  await userEvent.click(screen.getByRole('button', {name: 'Добавить материал'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Расход: Сталь'}), {target: {value: '2,25'}});
  await userEvent.click(screen.getByRole('button', {name: 'Сохранить условия'}));
  await waitFor(() => expect(saveExternalOffer).toHaveBeenCalledWith({provider_id: 'provider', item_id: 'semi', money_cost: '12.5', materials: [{material_id: 'steel', quantity: '2.25'}], active: true}, undefined));
}, 30_000);
