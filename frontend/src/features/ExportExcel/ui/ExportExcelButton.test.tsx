import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {downloadExcel} from '@/entities/Export';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ExportExcelButton} from './ExportExcelButton';

vi.mock('@/entities/Export', () => ({downloadExcel: vi.fn()}));

describe('ExportExcelButton', () => {
  it('exports the selected dataset with current filters', async () => {
    vi.mocked(downloadExcel).mockResolvedValue();
    const user = userEvent.setup();
    renderWithProviders(
      <ExportExcelButton
        dataset="materials"
        params={{search: 'сталь', deficit_only: true, ids: ['first', 'second']}}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Экспорт Excel'}));

    await waitFor(() =>
      expect(downloadExcel).toHaveBeenCalledWith('materials', {
        search: 'сталь',
        deficit_only: true,
        ids: ['first', 'second'],
      }),
    );
  });
});
