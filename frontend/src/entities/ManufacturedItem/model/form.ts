import type {ManufacturedItem, ManufacturedItemFormValue} from './types';

export const emptyManufacturedItemForm: ManufacturedItemFormValue = {
  name: '',
  isProduct: false,
  unit: 'шт.',
  initialQuantity: '0',
  image: '',
};

export function manufacturedItemToForm(
  item: ManufacturedItem,
): ManufacturedItemFormValue {
  return {
    name: item.name,
    isProduct: item.is_product,
    unit: item.unit,
    initialQuantity: '0',
    image: item.image ?? '',
  };
}
