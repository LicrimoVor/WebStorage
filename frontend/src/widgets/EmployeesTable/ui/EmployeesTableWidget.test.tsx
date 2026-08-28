import {screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useEmployeesQuery} from '@/entities/Employee';
import type * as EmployeeExports from '@/entities/Employee';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {EmployeesTableWidget} from './EmployeesTableWidget';

vi.mock('@/entities/Employee', async (importOriginal) => {
  const actual = await importOriginal<typeof EmployeeExports>();
  return {...actual, useEmployeesQuery: vi.fn()};
});

describe('EmployeesTableWidget', () => {
  it('renders empty state', () => {
    vi.mocked(useEmployeesQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: {items: [], page: 1, page_size: 20, total: 0, pages: 0},
    } as unknown as ReturnType<typeof useEmployeesQuery>);
    renderWithProviders(<EmployeesTableWidget />, '/personnel');
    expect(screen.getByText('Сотрудников пока нет')).toBeInTheDocument();
  });
});
