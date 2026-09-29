import { Alert, Select, TextInput } from "@gravity-ui/uikit";
import {operationGroupLabel, useOperationGroupsQuery} from '@/entities/OperationGroup/api';

import type { OperationFormValue } from "../model/types";
import styles from "./OperationForm.module.scss";

interface OperationFormProps {
  value: OperationFormValue;
  onChange: (value: OperationFormValue) => void;
  error?: string | undefined;
}

export function OperationForm({ value, onChange, error }: OperationFormProps) {
  const groups = useOperationGroupsQuery();
  const update = (field: keyof OperationFormValue, fieldValue: string) => {
    onChange({ ...value, [field]: fieldValue });
  };
  return (
    <div className={styles.root}>
      {error ? <Alert theme="danger" message={error} /> : null}
      <p>Название и группа помогают найти операцию. Норма времени и ставка используются при расчёте работ.</p>
      <Select label="Группа" aria-label="Группа операции" value={value.groupId ? [value.groupId] : []}
        loading={groups.isPending}
        options={(groups.data ?? []).map((g) => ({value: g.id, content: operationGroupLabel(g, groups.data ?? [])}))}
        onUpdate={(ids) => update('groupId', ids[0] ?? '')} hasClear filterable width="max" size="l" placeholder="Без группы" />
      {groups.isError && <Alert theme="warning" message="Не удалось загрузить группы операций. Повторите открытие формы." />}
      <TextInput
        label="Название"
        value={value.name}
        onUpdate={(next) => update("name", next)}
        controlProps={{ "aria-label": "Название операции" }}
        autoFocus
        size="l"
      />
      <TextInput
        label="Норма времени (мин/ед)"
        value={value.timeNorm}
        onUpdate={(next) => update("timeNorm", next)}
        controlProps={{
          "aria-label": "Норма времени операции",
          inputMode: "decimal",
        }}
        placeholder="Не указана"
        size="l"
      />
      <TextInput
        label="Ставка (руб/ед)"
        value={value.pricePerOperation}
        onUpdate={(next) => update("pricePerOperation", next)}
        controlProps={{
          "aria-label": "Ставка за операцию",
          inputMode: "decimal",
        }}
        placeholder="Не указана"
        size="l"
      />
    </div>
  );
}
