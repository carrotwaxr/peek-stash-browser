import { type ComponentProps, useMemo } from "react";
import { type NavigateFunction, useNavigate } from "react-router-dom";
import {
  CARD_INDICATORS,
  type CardIndicatorTable,
  getIndicatorBehavior,
} from "../../config/indicatorBehaviors";
import { useConfig } from "../../contexts/ConfigContext";
import { getFilteredListPath } from "../../utils/entityLinks";
import type { CardIndicator } from "../ui/BaseCard";
import { TooltipEntityGrid } from "../ui/TooltipEntityGrid";

type CardType = keyof typeof CARD_INDICATORS;

/** The row a card type's table reads */
type RowOf<K extends CardType> =
  (typeof CARD_INDICATORS)[K] extends CardIndicatorTable<infer E> ? E : never;

type TooltipEntities = ComponentProps<typeof TooltipEntityGrid>["entities"];

function buildIndicators<E>(
  cardType: CardType,
  table: CardIndicatorTable<E>,
  entity: E,
  navigate: NavigateFunction,
  hasMultipleInstances: boolean
): CardIndicator[] {
  const owner =
    table.owner?.(entity) ??
    (entity as { id?: string; instanceId?: string | undefined });
  const indicators: CardIndicator[] = [];

  for (const spec of table.indicators) {
    const count = spec.count(entity);
    if (table.omitEmpty && !(count && count > 0)) continue;
    const behavior = spec.relationship
      ? getIndicatorBehavior(cardType, spec.relationship)
      : "count";

    const entities =
      spec.tooltip && behavior === "rich"
        ? spec.tooltip.entities(entity)
        : undefined;
    const total = spec.tooltip?.total?.(entity);
    const tooltipContent =
      spec.tooltip && entities && entities.length > 0 ? (
        <TooltipEntityGrid
          entityType={spec.tooltip.entityType}
          entities={entities as TooltipEntities}
          title={spec.tooltip.title}
          {...(owner.instanceId !== undefined
            ? { parentInstanceId: owner.instanceId }
            : {})}
          {...(total !== undefined ? { total } : {})}
        />
      ) : (
        spec.tooltipText
      );

    const path =
      spec.link && behavior === "nav" && (count ?? 0) > 0
        ? getFilteredListPath(
            spec.link.page,
            spec.link.filter,
            owner,
            hasMultipleInstances
          )
        : undefined;

    indicators.push({
      type: spec.type,
      count,
      ...(tooltipContent ? { tooltipContent } : {}),
      ...(spec.countLabel ? { countLabel: spec.countLabel } : {}),
      onClick: path ? () => void navigate(path) : undefined,
    });
  }
  return indicators;
}

/**
 * A card's counts from its table in `CARD_INDICATORS` (LG-R4): each count's
 * behavior decides whether it shows a tooltip grid or opens its list. The
 * same row gives the same array, so a card that renders again for another
 * reason hands its indicators on unchanged.
 */
export function useCardIndicators<K extends CardType>(
  cardType: K,
  entity: RowOf<K>
): CardIndicator[] {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  return useMemo(
    () =>
      buildIndicators(
        cardType,
        CARD_INDICATORS[cardType] as CardIndicatorTable<RowOf<K>>,
        entity,
        navigate,
        hasMultipleInstances
      ),
    [cardType, entity, navigate, hasMultipleInstances]
  );
}
