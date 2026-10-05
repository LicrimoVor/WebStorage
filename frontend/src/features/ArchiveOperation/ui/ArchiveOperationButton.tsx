import type {Operation} from '@/entities/Operation';
import {DeleteEntityButton} from '@/features/DeleteEntity/DeleteEntityButton';

export function ArchiveOperationButton({operation}: {operation: Operation}) {
  return <DeleteEntityButton kind="operation" id={operation.id} name={operation.name} />;
}
