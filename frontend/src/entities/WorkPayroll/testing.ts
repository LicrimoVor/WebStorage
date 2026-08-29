import type {Payment, WorkEntry} from './model/types';

export const workEntryFixture: WorkEntry = {
  id: 'a04ce6b1-1f15-4610-b6ec-2a952468c3c3',
  employee_id: 'f4f2d8df-86fa-4ee7-94ba-4f83ea5b9b6c',
  employee_name: 'Иванов Иван Иванович',
  operation_id: '046791de-a39d-412e-848c-64465806c45b',
  operation_name: 'Сверление',
  input_mode: 'quantity',
  input_value: '2.000000',
  equivalent_quantity: '2.000000',
  time_minutes: '7.000000',
  time_norm_snapshot: '3.500000',
  rate_snapshot: '12.40',
  accrued_amount: '24.80',
  paid_amount: '0.00',
  payable_amount: '24.80',
  calculation_message: null,
  performed_at: '2026-08-28T05:00:00Z',
  comment: null,
  created_by: 'local-development',
  created_at: '2026-08-28T05:00:00Z',
  updated_at: '2026-08-28T05:00:00Z',
  voided_at: null,
  voided_by: null,
  void_reason: null,
};

export const paymentFixture: Payment = {
  id: '54f29e67-7f83-4284-9705-7d6d94f07731',
  employee_id: workEntryFixture.employee_id,
  employee_name: workEntryFixture.employee_name,
  amount: '20.00',
  paid_at: '2026-08-29T05:00:00Z',
  comment: null,
  created_by: 'local-development',
  created_at: '2026-08-29T05:00:00Z',
  allocation_mode: 'fifo',
  allocations: [
    {
      work_entry_id: workEntryFixture.id,
      operation_id: workEntryFixture.operation_id,
      operation_name: workEntryFixture.operation_name,
      performed_at: workEntryFixture.performed_at,
      amount: '20.00',
    },
  ],
};
