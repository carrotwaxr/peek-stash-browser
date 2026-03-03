import { type ReactNode } from 'react';
import { GridLayout } from './layouts/GridLayout';

interface Props {
  layoutType?: "grid" | "list" | "compact";
  entityType: string;
  density?: "small" | "medium" | "large";
  items: unknown[];
  renderItem: (item: unknown, index: number) => ReactNode;
  loading?: boolean;
  renderSkeleton?: () => ReactNode;
  skeletonCount?: number;
  className?: string;
}

export const LayoutRenderer = ({
  layoutType = 'grid',
  entityType,
  density = "medium",
  items,
  renderItem,
  loading = false,
  renderSkeleton,
  skeletonCount = 12,
  className = "",
}: Props) => {
  // Route to appropriate layout
  switch (layoutType) {
    // Future layouts will be added here:
    // case 'list':
    //   return (
    //     <ListLayout
    //       items={items}
    //       renderItem={renderItem}
    //       loading={loading}
    //       renderSkeleton={renderSkeleton}
    //       skeletonCount={skeletonCount}
    //       className={className}
    //     />
    //   );
    //
    // case 'compact':
    //   return (
    //     <CompactGridLayout
    //       items={items}
    //       renderItem={renderItem}
    //       loading={loading}
    //       renderSkeleton={renderSkeleton}
    //       skeletonCount={skeletonCount}
    //       className={className}
    //     />
    //   );

    case 'grid':
    default:
      return (
        <GridLayout
          entityType={entityType}
          density={density}
          items={items}
          renderItem={renderItem}
          loading={loading}
          renderSkeleton={renderSkeleton}
          skeletonCount={skeletonCount}
          className={className}
        />
      );
  }
};

export default LayoutRenderer;
