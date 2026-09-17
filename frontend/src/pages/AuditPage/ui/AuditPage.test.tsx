import {fireEvent, screen, waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';

import {useAuditEventsQuery} from '@/entities/Audit';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {AuditPage} from './AuditPage';

vi.mock('@/entities/Audit', () => ({useAuditEventsQuery: vi.fn()}));

it('shows the actor and saved before/after values', async () => {
  vi.mocked(useAuditEventsQuery).mockReturnValue({
    isPending: false, isError: false, isFetching: false, refetch: vi.fn(),
    data: {items: [{id: 15, actor: 'admin', action: 'update', entity: 'materials',
      entity_id: 'material-id', request_id: 'request-id', method: null, status_code: null,
      created_at: '2026-09-06T10:00:00Z', before: {name: 'Before'}, after: {name: 'After'}}],
    page: 1, page_size: 20, total: 1, pages: 1, through_id: 15},
  } as unknown as ReturnType<typeof useAuditEventsQuery>);
  renderWithProviders(<AuditPage />, '/audit');
  expect(screen.getByText('admin')).toBeVisible();
  fireEvent.click(screen.getByRole('button', {name: 'Подробности события 15'}));
  await waitFor(() => expect(screen.getByText(/"Before"/)).toBeVisible());
  expect(screen.getByText(/"After"/)).toBeVisible();
});
