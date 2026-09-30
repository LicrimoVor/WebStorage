import {screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it} from 'vitest';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {Select, TextInput} from './FormControls';

it('keeps the label separate from the example and filters long lists', async () => {
  renderWithProviders(<>
    <TextInput label="Название" placeholder="Например, сталь" />
    <Select aria-label="Материал" options={Array.from({length: 30}, (_, i) => ({value: String(i), content: `Материал ${i}`}))} />
  </>);
  expect(screen.getByLabelText('Название')).toHaveAttribute('placeholder', 'Например, сталь');
  await userEvent.click(screen.getByRole('combobox', {name: 'Материал'}));
  await userEvent.type(screen.getByPlaceholderText('Найти в списке…'), 'Материал 29');
  expect(screen.getByText('Материал 29')).toBeVisible();
  expect(screen.queryByText('Материал 10')).not.toBeInTheDocument();
});
