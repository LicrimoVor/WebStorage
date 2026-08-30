import type {Material, MaterialFormValue} from './types';

export const emptyMaterialForm: MaterialFormValue = {
  name: '',
  unit: 'шт.',
  initialQuantity: '0',
  price: '',
  url: '',
  image: '',
  groupIds: [],
};

export function materialToForm(material: Material): MaterialFormValue {
  return {
    name: material.name,
    unit: material.unit,
    initialQuantity: '0',
    price: material.price ?? '',
    url: material.url ?? '',
    image: material.image ?? '',
    groupIds: material.groups?.map((group) => group.id) ?? [],
  };
}
