import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useMaterialsQuery} from '@/entities/Material';
import type * as MaterialExports from '@/entities/Material';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {MaterialsTableWidget} from './MaterialsTableWidget';

vi.mock('@/entities/Material', async (importOriginal) => {
  const actual = await importOriginal<typeof MaterialExports>();
  return {...actual, useMaterialsQuery: vi.fn()};
});

describe('MaterialsTableWidget states', () => {
  it('renders loading state', () => {
    vi.mocked(useMaterialsQuery).mockReturnValue({
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useMaterialsQuery>);
    renderWithProviders(<MaterialsTableWidget />);
    expect(screen.getByLabelText('Загрузка материалов')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    vi.mocked(useMaterialsQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [], page: 1, page_size: 20, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useMaterialsQuery>);
    renderWithProviders(<MaterialsTableWidget />);
    expect(screen.getByText('Материалов пока нет')).toBeInTheDocument();
  });

  it('renders recoverable error state', () => {
    vi.mocked(useMaterialsQuery).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('network'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMaterialsQuery>);
    renderWithProviders(<MaterialsTableWidget />);
    expect(screen.getByText('Не удалось загрузить материалы')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Повторить'})).toBeInTheDocument();
  });
});
