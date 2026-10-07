import {Alert, Button, Text} from '@gravity-ui/uikit';
import {useItemProcessRecipeQuery, type ProcessNode} from '@/entities/TechnologicalProcess';
import {getErrorMessage} from '@/shared/api';
import {formatDecimal} from '@/shared/lib';
import {routes} from '@/shared/routes';
import {normalizeGraph, type CanvasGraph} from '../model/excalidraw';
import {recipeComposition} from '../model/recipeComposition';
import styles from './ProcessCanvas.module.scss';

const typeNames: Record<ProcessNode['type'], string> = {
  material: 'Материал', operation: 'Операция', manufactured_item: 'Полуфабрикат', output: 'Результат', comment: 'Комментарий',
};

export function NodeRecipe({graph, node, processId, onSelect}: {
  graph: CanvasGraph; node: ProcessNode; processId: string; onSelect: (ids: Set<string>) => void;
}) {
  const local = node.type === 'output' || graph.edges.some((edge) => edge.target === node.id);
  const external = useItemProcessRecipeQuery(node.referenceId ?? '', processId, !local);
  if (!local && !node.referenceId) return <Text color="secondary">Сопоставьте полуфабрикат со справочником, чтобы найти его рецепт.</Text>;
  if (!local && external.isPending) return <Text>Загрузка состава…</Text>;
  if (!local && external.isError) return <Alert theme="danger" title="Не удалось загрузить состав"
    message={getErrorMessage(external.error)} actions={<Button onClick={() => external.refetch()}>Повторить</Button>} />;
  if (!local && !external.data) return <Text color="secondary">Рецепт полуфабриката не найден.</Text>;
  const composition = recipeComposition(local ? graph : normalizeGraph(external.data!.version.graph),
    local ? node.id : external.data!.target_node_id);
  return <div className={styles.dialogForm}>
    <Text color="secondary">Состав на 1 единицу: {node.label || 'Позиция'}.</Text>
    {!local && <Text>Техпроцесс: {external.data!.process_name} · версия {external.data!.version.version_number}</Text>}
    {composition.error && <Alert theme="warning" message={composition.error} />}
    {composition.nodes.length ? <table className={styles.recipeTable}>
      <thead><tr><th>Состав</th><th>Тип</th><th>Количество</th></tr></thead>
      <tbody>{composition.nodes.map((component) => <tr key={component.id}>
        <td>{component.label || typeNames[component.type]}</td><td>{typeNames[component.type]}</td>
        <td>{composition.error ? '—' : formatDecimal(String(composition.quantities.get(component.id) ?? 0))}</td>
      </tr>)}</tbody>
    </table> : <Text color="secondary">Состав пока не задан.</Text>}
    {local ? <Button onClick={() => onSelect(composition.ids)}>Выделить</Button>
      : <Button href={`${routes.processEditor(external.data!.process_id)}?version=${external.data!.version.id}`}>Перейти в другой техпроцесс</Button>}
  </div>;
}
