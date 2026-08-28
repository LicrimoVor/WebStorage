import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {useTechnologicalProcessesQuery} from '@/entities/TechnologicalProcess';
import type * as TechnologicalProcessExports from '@/entities/TechnologicalProcess';
import {technologicalProcessFixture} from '@/entities/TechnologicalProcess/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {TechnologicalProcessesWidget} from './TechnologicalProcessesWidget';

vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedItemExports>();
  return {...actual, useManufacturedItemsQuery: vi.fn()};
});

vi.mock('@/entities/TechnologicalProcess', async (importOriginal) => {
  const actual = await importOriginal<typeof TechnologicalProcessExports>();
  return {...actual, useTechnologicalProcessesQuery: vi.fn()};
});

function mockItemsQuery() {
  vi.mocked(useManufacturedItemsQuery).mockReturnValue({
    isPending: false,
    data: {items: [], page: 1, page_size: 100, total: 0, pages: 0},
  } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
}

describe('TechnologicalProcessesWidget', () => {
  it('renders empty state with creation and import actions', () => {
    mockItemsQuery();
    vi.mocked(useTechnologicalProcessesQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [], page: 1, page_size: 20, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useTechnologicalProcessesQuery>);
    renderWithProviders(<TechnologicalProcessesWidget />, '/processes');
    expect(screen.getByText('Техпроцессов пока нет')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Импорт JSON'})).toBeInTheDocument();
  });

  it('shows version, status, output and author', () => {
    mockItemsQuery();
    vi.mocked(useTechnologicalProcessesQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        items: [technologicalProcessFixture],
        page: 1,
        page_size: 20,
        total: 1,
        pages: 1,
      },
    } as unknown as ReturnType<typeof useTechnologicalProcessesQuery>);
    renderWithProviders(<TechnologicalProcessesWidget />, '/processes');
    expect(screen.getByText('Сборка редуктора')).toBeInTheDocument();
    expect(screen.getByText('Редуктор Р-10')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Черновик')).toBeInTheDocument();
    expect(screen.getByText('local-development')).toBeInTheDocument();
  });
});
