import type {ProductionPlan} from '@/entities/ProductionPlan';
import {ReleaseProductsButton} from '@/features/ProduceManufacturedItem/ui/ReleaseProductsButton';

export function PlanRelease({plan}: {plan: ProductionPlan}) {
  return <ReleaseProductsButton productId={plan.product_id} productName={plan.product_name} label="Выпустить по плану" />;
}
