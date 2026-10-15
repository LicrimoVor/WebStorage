import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it, vi} from 'vitest';
import {registerSale} from '@/entities/Sale';
import {saleFixture, saleSummaryFixture} from '@/entities/Sale/testing';
import {manufacturedItemFixture} from '@/entities/ManufacturedItem/testing';
import {apiRequest} from '@/shared/api';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';
import {SalesPage} from './SalesPage';

vi.mock('@/entities/Sale', async (original) => ({...await original<object>(), registerSale: vi.fn(),
  useSalesQuery: () => ({data: {items: [], page: 1, page_size: 20, total: 0, pages: 0, filtered_quantity: '0', filtered_amount: '0'}}),
  useSalesSummaryQuery: () => ({data: saleSummaryFixture}),
}));
const catalog = [
  {...manufacturedItemFixture, id: 'tracked', name: 'Подотчётный продукт', is_product: true, is_accountable: true, free_quantity: '0', released_quantity: 1},
  {...manufacturedItemFixture, id: 'unreleased', name: 'Ещё не выпущен', is_product: true, is_accountable: true, free_quantity: '100', released_quantity: 0},
  {...manufacturedItemFixture, id: 'anonymous', name: 'Анонимный товар', is_product: true, free_quantity: '2.5', released_quantity: 0},
  {...manufacturedItemFixture, id: 'tracked-semi', name: 'Подотчётный полуфабрикат', is_byproduct: true, is_accountable: true, free_quantity: '0', released_quantity: 1},
  {...manufacturedItemFixture, id: 'anonymous-semi', name: 'Анонимный полуфабрикат', is_byproduct: true, free_quantity: '2.5', released_quantity: 0},
  {...manufacturedItemFixture, id: 'empty-semi', name: 'Полуфабрикат без остатка', is_byproduct: true, free_quantity: '0', released_quantity: 0},
];
vi.mock('@/entities/Funding', () => ({useFundingSources: () => ({data: []}), FundingSelect: ({onChange}: {onChange: (id: string) => void}) => <button onClick={() => onChange('funding')}>Выбрать счёт</button>}));
vi.mock('@/shared/api', async (original) => ({...await original<object>(), apiRequest: vi.fn()}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(registerSale).mockResolvedValue(saleFixture);
  vi.mocked(apiRequest).mockImplementation(async <T,>(path: string): Promise<T> => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/manufactured-items') {
      const page = Number(url.searchParams.get('page') ?? 1);
      return {items: catalog.slice((page - 1) * 3, page * 3), page, page_size: 3, pages: 2, total: catalog.length} as T;
    }
    if (url.pathname === '/product-units' && url.searchParams.get('product_id') !== 'unreleased') {
      return [
        {serial_number: 'ID / №1', sale_id: null, issued_for_repair_id: null},
        {serial_number: 'Sold', sale_id: 'sale', issued_for_repair_id: null},
        {serial_number: 'Repair', sale_id: null, issued_for_repair_id: 'repair'},
      ] as T;
    }
    return [] as T;
  });
});

async function openSaleDialog() {
  await userEvent.click(screen.getByRole('button', {name: 'Зарегистрировать продажу'}));
  await waitFor(() => expect(screen.getByText('Регистрация продажи')).toBeVisible());
}

it.each([
  ['tracked', 'Подотчётный продукт'],
  ['tracked-semi', 'Подотчётный полуфабрикат'],
])('sells accountable %s using available released IDs and derives the quantity', async (productId, name) => {
  renderWithProviders(<SalesPage />);
  await openSaleDialog();
  await userEvent.click(screen.getByRole('combobox', {name: 'Продаваемый продукт'}));
  expect(await screen.findByRole('option', {name: /Анонимный полуфабрикат/})).toBeInTheDocument();
  expect(screen.getByRole('option', {name: /Ещё не выпущен/})).toBeInTheDocument();
  expect(screen.getByRole('option', {name: /Полуфабрикат без остатка/})).toBeInTheDocument();
  expect(screen.getByRole('option', {name: new RegExp(`${name}.*выпущено 1`)})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('option', {name: new RegExp(name)}));
  await userEvent.click(screen.getByRole('combobox', {name: 'Выпущенные изделия для продажи'}));
  await userEvent.click(await screen.findByRole('option', {name: `${name} — ID: ID / №1`}));
  expect(screen.queryByRole('option', {name: /Sold|Repair/})).not.toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('textbox', {name: 'Количество продажи'})).toHaveValue('1');
  expect(screen.getByRole('textbox', {name: 'Количество продажи'})).toHaveAttribute('readonly');
  expect(screen.getByText('Выпущено и доступно к продаже: 1 шт.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', {name: 'Цена продажи'}), {target: {value: '10'}});
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  await userEvent.click(screen.getByRole('button', {name: 'Провести продажу'}));
  await waitFor(() => expect(registerSale).toHaveBeenCalledWith(expect.objectContaining({product_id: productId, quantity: '1', serial_numbers: ['ID / №1']}), expect.any(String)));
});

it.each([
  ['anonymous', 'Анонимный товар'],
  ['anonymous-semi', 'Анонимный полуфабрикат'],
])('sells unaccountable %s by quantity without requesting IDs', async (productId, name) => {
  renderWithProviders(<SalesPage />);
  await openSaleDialog();
  expect(screen.queryByRole('combobox', {name: 'Выпущенные изделия для продажи'})).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('combobox', {name: 'Продаваемый продукт'}));
  expect(await screen.findByRole('option', {name: /Подотчётный полуфабрикат/})).toBeInTheDocument();
  await userEvent.click(screen.getByRole('option', {name: new RegExp(name)}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Количество продажи'}), {target: {value: '1,25'}});
  fireEvent.change(screen.getByRole('textbox', {name: 'Цена продажи'}), {target: {value: '4'}});
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  await userEvent.click(screen.getByRole('button', {name: 'Провести продажу'}));
  await waitFor(() => expect(registerSale).toHaveBeenCalledWith(expect.objectContaining({product_id: productId, quantity: '1.25', serial_numbers: []}), expect.any(String)));
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.startsWith('/product-units'))).toBe(false);
});

it('clears released IDs and quantity when switching to an anonymous semi-finished item', async () => {
  renderWithProviders(<SalesPage />);
  await openSaleDialog();
  await userEvent.click(screen.getByRole('combobox', {name: 'Продаваемый продукт'}));
  await userEvent.click(await screen.findByRole('option', {name: /Подотчётный полуфабрикат/}));
  await userEvent.click(screen.getByRole('combobox', {name: 'Выпущенные изделия для продажи'}));
  await userEvent.click(await screen.findByRole('option', {name: 'Подотчётный полуфабрикат — ID: ID / №1'}));
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('textbox', {name: 'Количество продажи'})).toHaveValue('1');
  await userEvent.click(screen.getByRole('combobox', {name: 'Продаваемый продукт'}));
  await userEvent.click(await screen.findByRole('option', {name: /Анонимный полуфабрикат/}));
  expect(screen.queryByRole('combobox', {name: 'Выпущенные изделия для продажи'})).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', {name: 'Количество продажи'})).toHaveValue('');
  expect(screen.getByRole('textbox', {name: 'Количество продажи'})).not.toHaveAttribute('readonly');
  fireEvent.change(screen.getByRole('textbox', {name: 'Количество продажи'}), {target: {value: '1'}});
  fireEvent.change(screen.getByRole('textbox', {name: 'Цена продажи'}), {target: {value: '4'}});
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  await userEvent.click(screen.getByRole('button', {name: 'Провести продажу'}));
  await waitFor(() => expect(registerSale).toHaveBeenCalledWith(expect.objectContaining({product_id: 'anonymous-semi', quantity: '1', serial_numbers: []}), expect.any(String)));
});

it('shows all saleable catalog pages and explains why items without stock cannot be sold', async () => {
  renderWithProviders(<SalesPage />);
  await openSaleDialog();
  await userEvent.click(screen.getByRole('combobox', {name: 'Продаваемый продукт'}));
  await userEvent.click(await screen.findByRole('option', {name: /Ещё не выпущен/}));
  expect(await screen.findByText('Нет выпущенных изделий с ID для продажи. Сначала оформите выпуск этой позиции.')).toBeVisible();
  expect(screen.getByText('Выпущено и доступно к продаже: 0 шт.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', {name: 'Цена продажи'}), {target: {value: '4'}});
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  await userEvent.click(screen.getByRole('button', {name: 'Провести продажу'}));
  expect(await screen.findByText('Выберите ID всех продаваемых изделий: продукция подотчётная.')).toBeVisible();
  expect(registerSale).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('combobox', {name: 'Продаваемый продукт'}));
  await userEvent.click(await screen.findByRole('option', {name: /Полуфабрикат без остатка/}));
  expect(screen.getByText('Нет свободного остатка для продажи этой позиции.')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', {name: 'Количество продажи'}), {target: {value: '1'}});
  fireEvent.change(screen.getByRole('textbox', {name: 'Цена продажи'}), {target: {value: '4'}});
  await userEvent.click(screen.getByRole('button', {name: 'Выбрать счёт'}));
  await userEvent.click(screen.getByRole('button', {name: 'Провести продажу'}));
  expect(await screen.findByText('Количество продажи превышает свободный остаток продукта.')).toBeVisible();
  expect(registerSale).not.toHaveBeenCalled();
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => {
    const url = new URL(path, 'http://localhost');
    return url.pathname === '/manufactured-items' && url.searchParams.get('page') === '2' && url.searchParams.get('kind') === 'saleable';
  })).toBe(true);
});
