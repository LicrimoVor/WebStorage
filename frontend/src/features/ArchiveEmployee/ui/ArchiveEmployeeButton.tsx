import type {Employee} from '@/entities/Employee';
import {DeleteEntityButton} from '@/features/DeleteEntity/DeleteEntityButton';

export function ArchiveEmployeeButton({employee}: {employee: Employee}) {
  return <DeleteEntityButton kind="employee" id={employee.id} name={employee.full_name} />;
}
