import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {GroupTree} from './GroupTree';

it('nests subgroups under their parents and selects the subgroup id', async () => {
  const onSelect = vi.fn();
  render(<GroupTree allLabel="Все операции" selected="child" onSelect={onSelect} ungrouped groups={[
    {id: 'parent', name: 'Обработка'}, {id: 'child', name: 'Разное', parent_id: 'parent'},
    {id: 'second', name: 'Сборка'},
  ]} />);
  const parent = screen.getByRole('button', {name: 'Обработка'}).closest('li');
  expect(parent).not.toBeNull();
  const child = within(parent!).getByRole('button', {name: 'Разное'});
  expect(child).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(child);
  expect(onSelect).toHaveBeenCalledWith('child');
});
