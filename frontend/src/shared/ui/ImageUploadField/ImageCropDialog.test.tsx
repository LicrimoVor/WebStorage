import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, expect, it, vi} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {ImageCropDialog} from './ImageCropDialog';

afterEach(() => vi.restoreAllMocks());

it('crops the selected part using original image dimensions and returns an uploadable PNG', async () => {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage} as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['cropped'], {type: 'image/png'})));
  const onApply = vi.fn();
  renderWithProviders(<ImageCropDialog src="/media/original.png" alt="Материал" onClose={vi.fn()} onApply={onApply} pending={false} />);
  const img = screen.getByAltText('Материал');
  Object.defineProperties(img, {naturalWidth: {value: 1000}, naturalHeight: {value: 600}});
  fireEvent.load(img);
  fireEvent.change(screen.getByRole('slider', {name: 'Ширина области'}), {target: {value: '50'}});
  fireEvent.change(screen.getByRole('slider', {name: 'Высота области'}), {target: {value: '50'}});
  fireEvent.change(screen.getByRole('slider', {name: 'Сдвиг по горизонтали'}), {target: {value: '20'}});
  fireEvent.change(screen.getByRole('slider', {name: 'Сдвиг по вертикали'}), {target: {value: '10'}});
  await userEvent.click(screen.getByRole('button', {name: 'Применить обрезку'}));
  await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
  expect(drawImage).toHaveBeenCalledWith(img, 200, 60, 500, 300, 0, 0, 500, 300);
  expect(onApply.mock.calls[0][0]).toMatchObject({name: 'cropped-image.png', type: 'image/png'});
});

it('keeps the original image when cropping is cancelled', async () => {
  const onClose = vi.fn();
  const onApply = vi.fn();
  renderWithProviders(<ImageCropDialog src="/media/original.png" alt="Материал" onClose={onClose} onApply={onApply} pending={false} />);
  await userEvent.click(screen.getByRole('button', {name: 'Отмена'}));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onApply).not.toHaveBeenCalled();
});

it('reports external image restrictions without applying an unusable crop', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage: vi.fn()} as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {throw new DOMException('tainted', 'SecurityError');});
  const onApply = vi.fn();
  renderWithProviders(<ImageCropDialog src="https://example.com/image.png" alt="Материал" onClose={vi.fn()} onApply={onApply} pending={false} />);
  const img = screen.getByAltText('Материал');
  Object.defineProperties(img, {naturalWidth: {value: 100}, naturalHeight: {value: 100}});
  fireEvent.load(img);
  await userEvent.click(screen.getByRole('button', {name: 'Применить обрезку'}));
  expect(await screen.findByText('Сайт изображения запрещает обрезку. Загрузите изображение файлом и повторите.')).toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});
