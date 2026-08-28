import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {createMaterial} from '@/entities/Material';
import type * as MaterialExports from '@/entities/Material';
import {materialFixture} from '@/entities/Material/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {CreateMaterialButton} from './CreateMaterialButton';

vi.mock('@/entities/Material', async (importOriginal) => {
  const actual = await importOriginal<typeof MaterialExports>();
  return {...actual, createMaterial: vi.fn()};
});

describe('CreateMaterialButton', () => {
  it('creates a material with exact decimal strings', async () => {
    vi.mocked(createMaterial).mockResolvedValue(materialFixture);
    const user = userEvent.setup();
    renderWithProviders(<CreateMaterialButton />);

    await user.click(screen.getByRole('button', {name: 'Создать материал'}));
    await user.type(screen.getByLabelText('Название материала'), 'Лист стали');
    await user.clear(screen.getByLabelText('Единица измерения'));
    await user.type(screen.getByLabelText('Единица измерения'), 'кг');
    await user.clear(screen.getByLabelText('Начальный остаток'));
    await user.type(screen.getByLabelText('Начальный остаток'), '10,5');
    await user.type(screen.getByLabelText('Цена'), '125,40');
    await user.click(screen.getByRole('button', {name: 'Создать'}));

    await waitFor(() =>
      expect(createMaterial).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Лист стали',
          unit: 'кг',
          initial_quantity: '10.5',
          price: '125.40',
        }),
      ),
    );
  });
});
