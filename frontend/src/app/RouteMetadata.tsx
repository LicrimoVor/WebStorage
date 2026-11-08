import {matchPath} from 'react-router-dom';
import {usePageMetadata} from '@/shared/lib/seo';
import {routes} from '@/shared/routes';

const pages = [
  ['/settings/users', 'Пользователи', 'Учётные записи и доступ к разделам.'],
  ['/settings/trash', 'Корзина', 'Восстановление удалённых записей.'],
  [routes.profile, 'Профиль пользователя', 'Учётная запись и пароль.'],
  ['/production', 'Выпуск продукции', 'Выпуск номерных изделий.'],
  ['/repairs', 'Ремонт', 'Материалы, операции и история ремонтов.'],
  ['/settings', 'Настройки', 'Источники финансирования и журнал.'],
  ['/warehouse/receipt', 'Приход', 'Поступление материалов.'],
  [routes.procurement, 'Закупки по дефициту', 'Потребности в материалах и таблица закупок.'],
  [routes.audit, 'Журнал событий', 'История изменений и событий системы.'],
  [routes.productionPlans, 'Планирование производства', 'Планы производства, потребности и прогресс выпуска.'],
  [routes.stockRevision, 'Ревизия склада', 'Инвентаризация материалов, полуфабрикатов и продукции.'],
  [routes.warehouse, 'Склад', 'Остатки материалов, полуфабрикатов и готовой продукции.'],
  [routes.operationInstructionPattern, 'Техническая инструкция', 'Редактирование технического описания операции.'],
  [routes.operations, 'Операции', 'Справочник производственных операций.'],
  [routes.processPrompt, 'Промпт для техпроцесса', 'Промпт для формирования JSON технологического процесса.'],
  [routes.processes, 'Технологические процессы', 'Версии, графы и операции технологических процессов.'],
  [routes.processEditorPattern, 'Редактор техпроцесса', 'Редактирование графа и версий технологического процесса.'],
  [routes.personnel, 'Персонал', 'Сотрудники, выполненные работы и начисления.'],
  [routes.sales, 'Продажи', 'Журнал продаж готовой продукции.'],
  [routes.finance, 'Финансы', 'Доходы, расходы и финансовая сводка.'],
  [routes.analytics, 'Аналитика', 'Показатели производства и склада.'],
] as const;

function Metadata({title, description}: {title: string; description: string}) {
  usePageMetadata(title, description);
  return null;
}

export function RouteMetadata({pathname, search}: {pathname: string; search: string}) {
  // HelpPage owns its chapter metadata. A parent effect would overwrite its title
  // on the first visit, because effects run from children to parents.
  if (matchPath('/help/:chapterId?', pathname)) return null;

  if (matchPath(routes.productionPlans, pathname)) {
    const tab = new URLSearchParams(search).get('tab');
    if (tab === 'release') {
      return <Metadata title="Выпуск продукции" description="Регистрация выпуска готовой продукции и номерных изделий." />;
    }
    if (tab === 'stock') {
      return <Metadata title="Склад готовой продукции" description="Выпущенные изделия, серийные номера и остатки готовой продукции." />;
    }
  }

  const page = pages.find(([pattern]) => matchPath(pattern, pathname));
  return <Metadata
    title={page?.[1] ?? 'Страница не найдена'}
    description={page?.[2] ?? 'Запрошенная страница не существует.'}
  />;
}
