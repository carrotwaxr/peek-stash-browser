import { GridLayout } from './layouts/GridLayout.jsx';

/**
 * LayoutRenderer - Pluggable layout system
 *
 * Responsibilities:
 * - Route to correct layout based on layoutType
 * - Each layout is pure - only knows about spacing/columns
 * - Extensible - easy to add new layouts
 *
 * Currently only supports 'grid' layout. Future layouts (list, compact) can be
 * added by importing them and adding cases to the switch statement.
 *
 * @param {Object} props
 * @param {'grid'|'list'|'compact'} props.layoutType - Layout mode
 * @param {string} props.entityType - For grid type selection ('scene' vs 'standard')
 * @param {string} [props.density] - Grid density level ('small', 'medium', 'large')
 * @param {Array} props.items - Items to render
 * @param {Function} props.renderItem - Render function for each item
 * @param {boolean} [props.loading] - Loading state
 * @param {Function} [props.renderSkeleton] - Custom skeleton renderer
 * @param {number} [props.skeletonCount] - Number of skeletons
 * @param {string} [props.className] - Additional CSS classes
 */
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
}) => {
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
