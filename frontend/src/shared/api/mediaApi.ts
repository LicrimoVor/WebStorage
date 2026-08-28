import type {components} from './generated/schema';
import {apiRequest} from './client';

export type ImageUploadRequest = components['schemas']['ImageUploadRequest'];
export type ImageUploadRead = components['schemas']['ImageUploadRead'];

export async function uploadImage(
  payload: ImageUploadRequest,
): Promise<ImageUploadRead> {
  return apiRequest<ImageUploadRead>('/media/images', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
