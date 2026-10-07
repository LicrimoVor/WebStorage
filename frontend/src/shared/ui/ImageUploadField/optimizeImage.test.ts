import {afterEach, expect, it, vi} from 'vitest';
import {optimizeImage} from './optimizeImage';
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
it('preserves animated formats and small images', async () => {
  const file = new File([new Uint8Array(40_000)], 'animation.gif', {type: 'image/gif'});
  const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
  expect(await optimizeImage(file)).toBe(file);
  expect(decode).not.toHaveBeenCalled();
});
it('reduces large pictures proportionally and releases the decoded bitmap', async () => {
  const file = new File([new Uint8Array(40_000)], 'photo.jpg', {type: 'image/jpeg'});
  const bitmap = {width: 4096, height: 2048, close: vi.fn()};
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage: draw} as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob([new Uint8Array(1000)], {type: 'image/webp'})));
  const result = await optimizeImage(file);
  expect(result.name).toBe('photo.webp');
  expect(result.type).toBe('image/webp');
  expect(result.size).toBe(1000);
  expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1024);
  expect(bitmap.close).toHaveBeenCalledOnce();
});
it('uses the original when decoding fails', async () => {
  const file = new File([new Uint8Array(40_000)], 'photo.jpg', {type: 'image/jpeg'});
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decoder')));
  expect(await optimizeImage(file)).toBe(file);
});
