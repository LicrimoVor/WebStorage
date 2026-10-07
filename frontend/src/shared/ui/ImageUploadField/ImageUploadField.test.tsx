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
  it('hides cropping in creation forms while keeping the full image preview', () => {
    renderWithProviders(<ImageUploadField value="/media/rectangle.png" onUpdate={vi.fn()} alt="Материал" allowCrop={false} />);
    expect(screen.queryByRole('button', {name: 'Обрезать'})).not.toBeInTheDocument();
    expect(screen.getByRole('img', {name: 'Материал'})).toHaveAttribute('src', '/media/rectangle.png');
    expect(screen.getByRole('button', {name: 'Заменить'})).toBeEnabled();
  });
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

  it('uploads an image pasted into the link field instead of pasting accompanying text', async () => {
    vi.mocked(uploadImage).mockClear();
    vi.mocked(uploadImage).mockResolvedValue({url: '/media/pasted.png', content_type: 'image/png', size: 4});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'clipboard.png', {type: 'image/png'});
    Object.defineProperty(file, 'arrayBuffer', {value: async () => new Uint8Array([137, 80, 78, 71]).buffer});
    const onUpdate = vi.fn();
    renderWithProviders(<ImageUploadField value="/media/old.png" onUpdate={onUpdate} alt="Материал" />);
    const accepted = fireEvent.paste(screen.getByLabelText('Ссылка на изображение'), {clipboardData: {
      items: [{kind: 'file', type: 'image/png', getAsFile: () => file}], files: [file],
      getData: () => 'https://example.com/page',
    }});
    expect(accepted).toBe(false);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('/media/pasted.png'));
    expect(uploadImage).toHaveBeenCalledWith({filename: 'clipboard.png', content_type: 'image/png', content_base64: 'iVBORw=='});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports clipboard files when the items list is empty', async () => {
    vi.mocked(uploadImage).mockClear();
    vi.mocked(uploadImage).mockResolvedValue({url: '/media/pasted.webp', content_type: 'image/webp', size: 4});
    const file = new File(['webp'], 'clipboard.webp', {type: 'image/webp'});
    Object.defineProperty(file, 'arrayBuffer', {value: async () => new Uint8Array([1, 2, 3, 4]).buffer});
    const onUpdate = vi.fn();
    renderWithProviders(<ImageUploadField value="" onUpdate={onUpdate} alt="Полуфабрикат" />);
    fireEvent.paste(screen.getByLabelText('Ссылка на изображение'), {clipboardData: {items: [], files: [file]}});
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('/media/pasted.webp'));
  });

  it('rejects oversized pasted images and keeps the stored image', () => {
    vi.mocked(uploadImage).mockClear();
    const onUpdate = vi.fn();
    renderWithProviders(<ImageUploadField value="/media/old.png" onUpdate={onUpdate} alt="Материал" />);
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {type: 'image/png'});
    fireEvent.paste(screen.getByLabelText('Ссылка на изображение'), {clipboardData: {items: [], files: [file]}});
    expect(screen.getByText('Файл превышает допустимый размер 5 МБ')).toBeInTheDocument();
    expect(screen.getByRole('img', {name: 'Материал'})).toHaveAttribute('src', '/media/old.png');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
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

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Ссылка на изображение'));
    await user.paste('https://example.com/image.png');
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
