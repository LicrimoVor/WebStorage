import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useOperationsQuery} from '@/entities/Operation';
import type * as OperationExports from '@/entities/Operation';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {OperationsTableWidget} from './OperationsTableWidget';

vi.mock('@/entities/Operation', async (importOriginal) => {
  const actual = await importOriginal<typeof OperationExports>();
  return {...actual, useOperationsQuery: vi.fn()};
});

describe('OperationsTableWidget', () => {
  it('renders empty state', () => {
    vi.mocked(useOperationsQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [], page: 1, page_size: 20, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useOperationsQuery>);
    renderWithProviders(<OperationsTableWidget />, '/operations');
    expect(screen.getByText('Операций пока нет')).toBeInTheDocument();
  });
});
