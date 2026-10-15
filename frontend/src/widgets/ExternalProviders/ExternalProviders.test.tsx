import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it, vi} from 'vitest';
import {saveExternalOffer, saveExternalProvider} from '@/entities/External';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ExternalProviders} from './ExternalProviders';
import {apiRequest} from '@/shared/api';
import type {ExternalOffer} from '@/entities/External';
const state = vi.hoisted(() => ({offers: [] as ExternalOffer[]}));
vi.mock('@/entities/Auth', () => ({useAuthSessionQuery: () => ({data: {roles: ['admin']}})}));

vi.mock('@/entities/External', () => ({externalKeys: ['externals'],
  useExternalProvidersQuery: () => ({data: [{id: 'provider', name: 'Подрядчик'}]}),
  useExternalOffersQuery: () => ({data: state.offers}), saveExternalOffer: vi.fn(), saveExternalProvider: vi.fn(),
}));
vi.mock('@/entities/ManufacturedItem', () => ({useManufacturedItemsQuery: () => ({data: {items: [{id: 'semi', name: 'Узел', unit: 'шт'}]}})}));
vi.mock('@/shared/api', async (original) => ({...await original<object>(),
  apiRequest: vi.fn().mockResolvedValue({items: [{id: 'process', name: 'Обработка', output_item_id: 'semi', output_item_name: 'Узел', active_version: {id: 'version'}}], pages: 1}),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.offers = [];
  vi.mocked(saveExternalProvider).mockResolvedValue({id: 'new', name: 'Новый подрядчик'});
  vi.mocked(saveExternalOffer).mockResolvedValue({id: 'offer', process_id: 'process', process_version_id: 'version', process_name: 'Обработка', provider_id: 'provider', provider_name: 'Подрядчик', item_id: 'semi', item_name: 'Узел', unit: 'шт', money_cost: '12.5', materials: [], active: true});
});

it('creates a provider in the settings dialog', async () => {
  renderWithProviders(<ExternalProviders />);
  await userEvent.click(screen.getByRole('button', {name: 'Добавить внешнего'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Название внешнего исполнителя'}), {target: {value: 'Новый подрядчик'}});
  await userEvent.click(screen.getByRole('button', {name: 'Создать исполнителя'}));
  await waitFor(() => expect(saveExternalProvider).toHaveBeenCalledWith('Новый подрядчик', undefined));
});

it('opens settings by clicking a row and assigns an existing process', async () => {
  renderWithProviders(<ExternalProviders />);
  await userEvent.click(screen.getByText('Подрядчик'));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(screen.queryByRole('button', {name: 'Добавить материал'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', {name: 'Техпроцесс внешнего исполнителя'}));
  await userEvent.click(await screen.findByRole('option', {name: 'Обработка — Узел'}));
  await userEvent.click(screen.getByRole('button', {name: 'Добавить техпроцесс'}));
  await waitFor(() => expect(saveExternalOffer).toHaveBeenCalledWith({provider_id: 'provider', process_id: 'process', active: true}, undefined));
});


it('deletes an external provider through the trash confirmation', async () => {
  renderWithProviders(<ExternalProviders />);
  await userEvent.click(screen.getByText('Подрядчик'));
  await userEvent.click(await screen.findByRole('button', {name: 'Удалить исполнителя'}));
  await userEvent.click(await screen.findByRole('button', {name: 'Удалить'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/trash/external_provider/provider', {method: 'DELETE'}));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('removes a process assignment without deleting the shared process', async () => {
  state.offers = [{id: 'offer', process_id: 'process', process_version_id: 'version', process_name: 'Обработка', provider_id: 'provider', provider_name: 'Подрядчик', item_id: 'semi', item_name: 'Узел', unit: 'шт', money_cost: '12.5', materials: [], active: true}];
  renderWithProviders(<ExternalProviders />);
  await userEvent.click(screen.getByText('Подрядчик'));
  await userEvent.click(await screen.findByRole('button', {name: 'Удалить техпроцесс'}));
  await waitFor(() => expect(screen.getByText(/Будет удалена привязка/)).toBeVisible());
  await userEvent.click(await screen.findByRole('button', {name: 'Удалить'}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/trash/external_offer/offer', {method: 'DELETE'}));
  expect(vi.mocked(apiRequest).mock.calls.some(([path, init]) => path === '/technological-processes/process' && init?.method === 'DELETE')).toBe(false);
});
