import { Select, TextInput } from "@/shared/ui/FormControls";
import { Alert, Checkbox } from "@gravity-ui/uikit";
import { useQuery } from "@tanstack/react-query";
import { listMaterials } from "../api/materialApi";
import type { Material } from "../model/types";

import { measurementUnitOptions } from "@/shared/lib";
import { ImageUploadField } from "@/shared/ui";
import { useInventoryGroupsQuery } from "@/entities/InventoryGroup";

import type { MaterialFormValue } from "../model/types";
import styles from "./MaterialForm.module.scss";

interface MaterialFormProps {
  value: MaterialFormValue;
  onChange: (value: MaterialFormValue) => void;
  includeInitialQuantity?: boolean;
  fixedSource?: boolean;
  error?: string | undefined;
}

export function MaterialForm({
  value,
  onChange,
  includeInitialQuantity = false,
  fixedSource = false,
  error,
}: MaterialFormProps) {
  const groupsQuery = useInventoryGroupsQuery();
  const sources = useQuery({
    queryKey: ["materials", "defect-sources"],
    enabled: !fixedSource && includeInitialQuantity && Boolean(value.isDefect),
    queryFn: async () => {
      const items: Material[] = [];
      for (let page = 1; ; page++) {
        const result = await listMaterials({ page, page_size: 100 });
        items.push(...result.items.filter((m) => !m.source_material_id));
        if (page >= result.pages) return items;
      }
    },
  });
  const update = (field: keyof MaterialFormValue, fieldValue: string) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className={styles.root}>
      {error ? <Alert theme="danger" message={error} /> : null}
      {includeInitialQuantity && !fixedSource && (
        <>
          <Checkbox
            checked={Boolean(value.isDefect)}
            onUpdate={(checked) =>
              onChange({ ...value, isDefect: checked, sourceMaterialId: "" })
            }
          >
            Является браком
          </Checkbox>
          {value.isDefect && (
            <Select
              label="Исходный материал"
              value={value.sourceMaterialId ? [value.sourceMaterialId] : []}
              loading={sources.isPending}
              options={(sources.data ?? []).map((m) => ({
                value: m.id,
                content: `${m.name} · ${m.groups?.map((g) => g.name).join(" / ") || "Без группы"}`,
              }))}
              onUpdate={([id]) => {
                const m = sources.data?.find((item) => item.id === id);
                if (m)
                  onChange({
                    ...value,
                    sourceMaterialId: m.id,
                    unit: m.unit,
                    price: m.price ?? "",
                    url: m.url ?? "",
                    image: m.image ?? "",
                  });
              }}
            />
          )}
          {value.isDefect && sources.isError && (
            <Alert theme="danger" message="Не удалось загрузить материалы" />
          )}
        </>
      )}
      <TextInput
        label="Название"
        value={value.name}
        onUpdate={(next) => update("name", next)}
        controlProps={{ "aria-label": "Название материала" }}
        autoFocus
        size="l"
      />
      {!fixedSource && (
        <Select
          label="Единица"
          disabled={Boolean(value.isDefect)}
          options={measurementUnitOptions}
          value={value.unit ? [value.unit] : []}
          onUpdate={(next) => update("unit", next[0] ?? "")}
          aria-label="Единица измерения"
          width="max"
          size="l"
        />
      )}
      <Select
        label="Группы"
        options={(groupsQuery.data ?? []).map((group) => ({
          value: group.id,
          content: group.parent_id
            ? `${groupsQuery.data?.find((g) => g.id === group.parent_id)?.name ?? ""} / ${group.name}`
            : group.name,
        }))}
        value={value.groupIds}
        onUpdate={(next) => onChange({ ...value, groupIds: next })}
        multiple
        hasClear
        filterable
        placeholder="Без группы"
        aria-label="Группы материала"
        width="max"
        size="l"
      />
      {includeInitialQuantity && !fixedSource ? (
        <TextInput
          label="Начальный остаток"
          value={value.initialQuantity}
          onUpdate={(next) => update("initialQuantity", next)}
          controlProps={{
            "aria-label": "Начальный остаток",
            inputMode: "decimal",
          }}
          size="l"
        />
      ) : null}
      {!fixedSource && (
        <>
          <TextInput
            label="Цена, ₽"
            disabled={Boolean(value.isDefect)}
            value={value.price}
            onUpdate={(next) => update("price", next)}
            controlProps={{ "aria-label": "Цена", inputMode: "decimal" }}
            placeholder="Не указана"
            size="l"
          />
          <TextInput
            label="Ссылка"
            disabled={Boolean(value.isDefect)}
            value={value.url}
            onUpdate={(next) => update("url", next)}
            controlProps={{ "aria-label": "Ссылка на материал" }}
            placeholder="https://…"
            size="l"
          />
          {!value.isDefect && (
            <ImageUploadField
              value={value.image}
              onUpdate={(next) => update("image", next)}
              alt="Предпросмотр материала"
            />
          )}
        </>
      )}
    </div>
  );
}
