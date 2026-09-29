import {readFileSync} from 'node:fs';
import {screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {chapters} from '@/shared/lib/help/chapters';
import {PageHelp} from './PageHelp';

it('opens contextual help and links to the relevant chapter', async () => {
  renderWithProviders(<PageHelp path="/warehouse/receipt" />);
  await userEvent.click(screen.getByRole('button', {name: 'О странице'}));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Приход материалов')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Открыть главу инструкции'})).toHaveAttribute('href', '/help/receipt');
});

it('ships actual screenshots for all documented chapters', () => {
  for (const chapter of chapters) {
    const image = readFileSync(`public/help/screenshots/${chapter.image}`);
    expect(image.toString('ascii', 0, 4)).toBe('RIFF');
    expect(image.toString('ascii', 8, 12)).toBe('WEBP');
  }
});
