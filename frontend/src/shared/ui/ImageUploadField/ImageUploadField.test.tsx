import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {uploadImage} from '@/shared/api';
import type * as ApiExports from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ImageUploadField} from './ImageUploadField';

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiExports>();
  return {...actual, uploadImage: vi.fn()};
});

describe('ImageUploadField', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('uploads an image and returns its media URL', async () => {
    vi.mocked(uploadImage).mockResolvedValue({
      url: 'http://test/media/image.png',
      content_type: 'image/png',
      size: 4,
    });
    const onUpdate = vi.fn();
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', {
      type: 'image/png',
    });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new Uint8Array([137, 80, 78, 71]).buffer,
    });
    const user = userEvent.setup();
    renderWithProviders(
      <ImageUploadField value="" onUpdate={onUpdate} alt="Материал" />,
    );

    await user.upload(screen.getByLabelText('Выбрать изображение'), file);

    await waitFor(() =>
      expect(uploadImage).toHaveBeenCalledWith({
        filename: 'image.png',
        content_type: 'image/png',
        content_base64: 'iVBORw==',
      }),
    );
    expect(onUpdate).toHaveBeenCalledWith('http://test/media/image.png');
  });

  it('downloads links and uploads bytes instead of storing the external URL', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], {type: 'image/png'});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true, headers: new Headers(), blob: async () => blob}));
    Object.defineProperty(File.prototype, 'arrayBuffer', {configurable: true,
      value: vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer)});
    vi.mocked(uploadImage).mockResolvedValue({url: '/media/imported.png', content_type: 'image/png', size: 4});
    const onUpdate = vi.fn();
    renderWithProviders(
      <ImageUploadField value="" onUpdate={onUpdate} alt="Материал" />,
    );

    fireEvent.change(screen.getByLabelText('Ссылка на изображение'), {target: {value: 'https://example.com/image.png'}});
    expect(onUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('/media/imported.png'));
    expect(uploadImage).toHaveBeenCalledWith({filename: 'image.png', content_type: 'image/png', content_base64: 'iVBORw=='});
    expect(onUpdate).not.toHaveBeenCalledWith('https://example.com/image.png');
  });
  it('keeps the stored image when downloading the link fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')));
    const onUpdate = vi.fn();
    renderWithProviders(<ImageUploadField value="/media/original.png" onUpdate={onUpdate} alt="Материал" />);
    fireEvent.change(screen.getByLabelText('Ссылка на изображение'), {target: {value: 'https://example.com/image.png'}});
    expect(await screen.findByText(/Браузер не смог скачать/)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
