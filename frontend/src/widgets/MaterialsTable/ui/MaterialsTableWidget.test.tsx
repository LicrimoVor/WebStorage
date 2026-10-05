import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {materialFixture} from '@/entities/Material/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {apiRequest} from '@/shared/api';
import {useProductOptionsQuery} from '@/entities/ManufacturedItem';
import type * as ManufacturedItemModule from '@/entities/ManufacturedItem';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {MaterialsTableWidget} from './MaterialsTableWidget';
import {useAuthSessionQuery} from '@/entities/Auth';
import type * as AuthModule from '@/entities/Auth';

vi.mock('@/entities/Auth', async (importOriginal) => ({
  ...await importOriginal<typeof AuthModule>(),
  useAuthSessionQuery: vi.fn(),
}));

vi.mock('@/shared/api', () => ({apiRequest: vi.fn(), getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Network error'}));
vi.mock('@/entities/ManufacturedItem', async (importOriginal) => ({
  ...await importOriginal<typeof ManufacturedItemModule>(),
  useProductOptionsQuery: vi.fn(),
}));
vi.mock('@/entities/InventoryGroup', () => ({
  inventoryGroupKeys: {all: ['inventory-groups']},
  useInventoryGroupsQuery: () => ({data: []}),
}));

describe('MaterialsTableWidget states', () => {
  beforeEach(() => {
    vi.mocked(useAuthSessionQuery).mockReturnValue({data: {roles: ['admin']}} as ReturnType<typeof useAuthSessionQuery>);
    vi.mocked(useProductOptionsQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useProductOptionsQuery>);
  });
  it('renders loading state', () => {
    vi.mocked(apiRequest).mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MaterialsTableWidget />);
    expect(screen.getByLabelText('Загрузка материалов')).toBeInTheDocument();
  });
  it('renders empty state', async () => {
    vi.mocked(apiRequest).mockResolvedValue({items: [], total: 0, pages: 0});
    renderWithProviders(<MaterialsTableWidget />);
    expect(await screen.findByText('Материалы: пока нет позиций')).toBeInTheDocument();
  });
  it('renders recoverable error state', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('network'));
    renderWithProviders(<MaterialsTableWidget />);
    expect(await screen.findByText('Не удалось загрузить материалы')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Повторить'})).toBeInTheDocument();
  });
  it('archives selected materials and semi-finished items through their own endpoints', async () => {
    let items = [
      {...materialFixture, kind: 'material'},
      {...materialFixture, id: 'semi', name: 'Заготовка', kind: 'semi_finished'},
    ];
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.includes('/archive')) {
        items = items.filter((item) => !path.includes(`/${item.id}/archive`));
        return {};
      }
      return {items: [...items], total: items.length, pages: 1};
    });
    renderWithProviders(<MaterialsTableWidget hideCreate />);
    await userEvent.click(await screen.findByRole('checkbox', {name: 'Выбрать все строки'}));
    expect(screen.getByRole('checkbox', {name: 'Выбрать: Лист стали'})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: 'Выбрать: Заготовка'})).toBeChecked();
    await userEvent.click(screen.getByRole('button', {name: 'Удалить (2)'}));
    expect(screen.getByText('Позиции будут перенесены в корзину. Их можно восстановить в настройках. История движений сохранится.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Удалить'}));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(`/materials/${materialFixture.id}/archive`, {method: 'POST'}));
    expect(apiRequest).toHaveBeenCalledWith('/manufactured-items/semi/archive', {method: 'POST'});
    expect(await screen.findByText('Материалы: пока нет позиций')).toBeInTheDocument();
  });
  it('does not offer selection and deletion to non-administrators', async () => {
    vi.mocked(useAuthSessionQuery).mockReturnValue({data: {roles: ['user']}} as ReturnType<typeof useAuthSessionQuery>);
    vi.mocked(apiRequest).mockResolvedValue({items: [{...materialFixture, kind: 'material'}], total: 1, pages: 1});
    renderWithProviders(<MaterialsTableWidget hideCreate />);
    expect(await screen.findByText(materialFixture.name)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', {name: 'Выбрать все строки'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Удалить/})).not.toBeInTheDocument();
  });
  it('keeps failed rows selected when part of a batch cannot be archived', async () => {
    let items = [{...materialFixture, kind: 'material'}, {...materialFixture, id: 'failed', name: 'Неудалённый', kind: 'material'}];
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/materials/failed/archive') throw new Error('blocked');
      if (path.includes('/archive')) {
        items = items.filter((item) => item.id === 'failed');
        return {};
      }
      return {items: [...items], total: items.length, pages: 1};
    });
    renderWithProviders(<MaterialsTableWidget hideCreate />);
    await userEvent.click(await screen.findByRole('checkbox', {name: 'Выбрать все строки'}));
    await userEvent.click(screen.getByRole('button', {name: 'Удалить (2)'}));
    await userEvent.click(screen.getByRole('button', {name: 'Удалить'}));
    expect(await screen.findByText('Не удалось удалить 1 позиций: blocked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Отмена'}));
    expect(await screen.findByRole('checkbox', {name: 'Выбрать: Неудалённый'})).toBeChecked();
    expect(screen.queryByRole('checkbox', {name: 'Выбрать: Лист стали'})).not.toBeInTheDocument();
  });
});
