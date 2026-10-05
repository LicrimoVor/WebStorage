import type {Material} from '@/entities/Material';
import {DeleteEntityButton} from '@/features/DeleteEntity/DeleteEntityButton';

export function ArchiveMaterialButton({material}: {material: Material}) {
  return <DeleteEntityButton kind="material" id={material.id} name={material.name} />;
}
