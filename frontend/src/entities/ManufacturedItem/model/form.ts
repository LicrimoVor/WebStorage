import type {ManufacturedItem, ManufacturedItemFormValue} from './types';

export const emptyManufacturedItemForm: ManufacturedItemFormValue = {
  name: '',
  isProduct: false,
  isByproduct: false,
  unit: 'шт.',
  initialQuantity: '0',
  image: '',
  groupIds: [],
};

export function manufacturedItemToForm(
  item: ManufacturedItem,
): ManufacturedItemFormValue {
  return {
    name: item.name,
    isProduct: item.is_product,
    isByproduct: item.is_byproduct ?? false,
    productId: item.product_id ?? "",
    unit: item.unit,
    initialQuantity: '0',
    image: item.image ?? '',
    groupIds: item.groups?.map((group) => group.id) ?? [],
  };
}
