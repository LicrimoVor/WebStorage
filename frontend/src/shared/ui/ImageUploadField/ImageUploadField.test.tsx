import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {uploadImage} from '@/shared/api';
import type * as ApiExports from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {ImageUploadField} from './ImageUploadField';

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiExports>();
  return {...actual, uploadImage: vi.fn()};
});

describe('ImageUploadField', () => {
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

  it('keeps manual image links available', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ImageUploadField value="" onUpdate={onUpdate} alt="Материал" />,
    );

    await user.type(
      screen.getByLabelText('Ссылка на изображение'),
      'https://example.com/image.webp',
    );

    expect(onUpdate).toHaveBeenCalled();
  });
});
