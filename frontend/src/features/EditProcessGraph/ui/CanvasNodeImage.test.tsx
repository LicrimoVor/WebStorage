import {fireEvent, screen, waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {apiRequest} from '@/shared/api';
import type * as ApiModule from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {CanvasNodeImage} from './CanvasNodeImage';

vi.mock('@/shared/api', async (original) => ({...await original<typeof ApiModule>(), apiRequest: vi.fn()}));

it('fetches an uncatalogued material once for its copies and falls back on image errors', async () => {
  vi.mocked(apiRequest).mockResolvedValue({image: '/media/steel.png'});
  renderWithProviders(<>
    <CanvasNodeImage type="material" referenceId="steel" name="Сталь" image={undefined} />
    <CanvasNodeImage type="material" referenceId="steel" name="Сталь" image={undefined} />
  </>);
  await waitFor(() => expect(screen.getAllByAltText('Сталь')).toHaveLength(2));
  expect(apiRequest).toHaveBeenCalledOnce();
  expect(apiRequest).toHaveBeenCalledWith('/materials/steel', expect.objectContaining({signal: expect.any(AbortSignal)}));
  fireEvent.error(screen.getAllByAltText('Сталь')[0]);
  expect(screen.getByLabelText('Нет изображения: Сталь')).toBeInTheDocument();
});
