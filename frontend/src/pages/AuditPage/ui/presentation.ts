import type {AuditEvent} from '@/entities/Audit';

const entities: Record<string, string> = {
  materials: 'Материалы', manufactured_items: 'Полуфабрикаты и продукты', operations: 'Операции',
  employees: 'Сотрудники', sales: 'Продажи', employee_payments: 'Выплаты сотрудникам',
  inventory_movements: 'Движения материалов', manufactured_item_movements: 'Движения продукции',
  technological_processes: 'Техпроцессы', production_plans: 'Планы производства', production_records: 'Выпуск продукции',
  business_documents: 'Приходы и ремонты', financial_transactions: 'Финансовые операции', finance: 'Финансы',
  funding_sources: 'Источники финансирования', inventory_groups: 'Группы склада', operation_groups: 'Группы операций',
  work_entries: 'Выполненные работы', users: 'Пользователи', auth: 'Учётная запись', payroll: 'Расчёт зарплаты',
  warehouse: 'Склад', repairs: 'Ремонт', product_units: 'Серийные номера', audit_events: 'Журнал событий',
};
export const fieldLabels: Record<string, string> = {
  name: 'Название', full_name: 'ФИО', quantity: 'Количество', price: 'Цена', unit: 'Единица измерения',
  amount: 'Сумма', total_amount: 'Общая сумма', comment: 'Комментарий', archived: 'В архиве', active: 'Активен',
  username: 'Логин', status: 'Статус', created_by: 'Автор', created_at: 'Создано', updated_at: 'Изменено',
  funding_source_id: 'Источник финансирования', parent_id: 'Родительская группа', group_id: 'Группа',
  hourly_rate: 'Ставка в час', time_norm: 'Норма времени', price_per_operation: 'Ставка за операцию',
  compensation_type: 'Способ оплаты', occurred_at: 'Дата операции', paid_at: 'Дата выплаты', sold_at: 'Дата продажи',
  transaction_type: 'Направление', category: 'Категория', serial_number: 'Номер изделия', permissions: 'Разделы доступа',
};
export function auditEntity(event: AuditEvent) {
  const resource = event.entity.replace(/^\/api\/v1\//, '').split('/')[0].replaceAll('-', '_');
  return entities[resource] ?? 'Запись приложения';
}
export function auditTitle(event: AuditEvent) {
  const data = event.after ?? event.before;
  const name = data?.name ?? data?.full_name ?? data?.username ?? data?.serial_number;
  if (event.action !== 'request') {
    const action = {insert: 'Создана запись', update: 'Изменена запись', delete: 'Удалена запись'}[event.action] ?? 'Изменение';
    if (event.after?.archived === true && event.before?.archived !== true) return `Перенесено в архив${name ? `: ${name}` : ''}`;
    return `${action}${name ? `: ${name}` : ''}`;
  }
  const path = event.entity;
  const special: [string, string][] = [
    ['/auth/login', 'Вход в систему'], ['/auth/logout', 'Выход из системы'], ['/auth/refresh', 'Продление сессии'],
    ['/auth/session', 'Проверка сессии'], ['/exports/', 'Выгрузка в Excel'], ['/archive', 'Перенос в архив'],
    ['/publish', 'Публикация техпроцесса'], ['/import', 'Импорт JSON'], ['/produce', 'Выпуск продукции'],
    ['/receipts', 'Регистрация прихода'], ['/payments', 'Регистрация выплаты'], ['/work-entries', 'Учёт выполненной работы'],
  ];
  const match = special.find(([part]) => path.includes(part));
  if (match && (event.method !== 'GET' || path.includes('/auth/') || path.includes('/exports/'))) return match[1];
  const verb = {GET: 'Просмотр', POST: 'Создание', PATCH: 'Изменение', PUT: 'Сохранение', DELETE: 'Удаление'}[event.method ?? ''] ?? 'Действие';
  return `${verb}: ${auditEntity(event).toLocaleLowerCase('ru')}`;
}
export function auditResult(event: AuditEvent) {
  const status = event.status_code;
  if (!status) return 'Сохранено';
  if (status < 400) return 'Успешно';
  return ({401: 'Требуется вход', 403: 'Нет доступа', 404: 'Не найдено', 409: 'Конфликт данных', 422: 'Ошибка заполнения'} as Record<number, string>)[status] ?? 'Ошибка выполнения';
}
export function auditValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (Array.isArray(value)) return value.map(auditValue).join(', ') || '—';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${fieldLabels[key] ?? key}: ${auditValue(item)}`).join('; ');
  return ({hourly: 'Почасовая', piecework: 'Сдельная', income: 'Доход', expense: 'Расход'} as Record<string, string>)[String(value)] ?? String(value);
}
