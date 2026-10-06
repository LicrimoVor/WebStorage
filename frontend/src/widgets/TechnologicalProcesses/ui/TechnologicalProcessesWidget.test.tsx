import {fireEvent, screen} from '@testing-library/react';
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
  it('renders empty state and puts the prompt and format inside JSON import', async () => {
    mockItemsQuery();
    vi.mocked(useTechnologicalProcessesQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [], page: 1, page_size: 20, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useTechnologicalProcessesQuery>);
    renderWithProviders(<TechnologicalProcessesWidget />, '/processes');
    expect(screen.queryByRole('button', {name: 'Промпт'})).not.toBeInTheDocument();
    expect(screen.getByText('Техпроцессов пока нет')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Импорт JSON'}));
    const help = await screen.findByText('Формат JSON и пример');
    fireEvent.click(help);
    expect(screen.getByLabelText('Формат JSON')).toHaveTextContent('schemaVersion');
    expect((screen.getByRole('textbox', {name: 'Промпт для ИИ', hidden: true}) as HTMLTextAreaElement).value).toContain('инженер-технолог');
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
