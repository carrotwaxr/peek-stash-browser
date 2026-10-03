import { useEffect, useRef, useState } from "react";
import type { OverwriteViewBody, TableColumnsConfig } from "@peek/shared-types";
import {
  PRESET_CONTEXT_LABELS,
  isPresetContext,
  presetArtifactType,
} from "@peek/shared-types/presetContexts.js";
import {
  LucideBookmark,
  LucideCheck,
  LucideChevronDown,
  LucidePencil,
  LucidePin,
  LucidePinOff,
  LucidePlus,
  LucideSave,
  LucideTrash2,
} from "lucide-react";
import { getErrorMessage } from "../../api/client";
import {
  type SavedPreset,
  presetsForContext,
  useDefaultPresets,
  useFilterPresets,
} from "../../api/hooks/usePresets";
import {
  type ViewConflict,
  useDeleteView,
  useOverwriteView,
  useRenameView,
  useSaveView,
  useSetDefaultView,
} from "../../api/hooks/useViews";
import { type ColumnConfig, presetColumnsOf } from "../../config/tableColumns";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import type { ListUrlState } from "../../hooks/useListUrlState";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import Popover from "../ui/Popover";
import StatusMessage from "../ui/StatusMessage";
import ViewNameDialog from "./ViewNameDialog";

interface Props {
  /** The list's state from the page's `useListUrlState` */
  listState: ListUrlState;
  /** The preset context ("scene", "scene_performer", ...): which Views and default */
  context: string;
  /** The page's fixed filters: never saved into a View */
  permanentFilters?: Record<string, unknown>;
  /** The table's columns, saved with a View in table view */
  currentTableColumns?: Record<string, unknown> | null;
  /** Shows a loaded View's table columns, or null for the user's own */
  onViewColumns?: (columns: ColumnConfig | null) => void;
}

const NO_FILTERS: Record<string, unknown> = {};

const ITEMS = '[role="menuitemradio"], [role="menuitem"]';

const STALE =
  "Your views changed in another tab or window, so they have been reloaded. Try again.";

const conflictMessage = (reason: ViewConflict, name: string) =>
  reason === "nameTaken" ? `A view named ${name} already exists` : STALE;

const contextLabel = (context: string) =>
  isPresetContext(context) ? PRESET_CONTEXT_LABELS[context] : context;

/** The table's columns as a View stores them, or none */
function storedColumns(
  columns: Record<string, unknown> | null
): TableColumnsConfig | null {
  const config = presetColumnsOf(columns);
  return config
    ? { visible: config.visible ?? [], order: config.order ?? [] }
    : null;
}

type Dialog = "save" | "rename" | null;

interface Toast {
  variant: "success" | "error";
  text: string;
}

/**
 * "Views: <name> ▾": the list's saved Views for its context. The button names
 * the View the list shows (`activeView`) and marks it when the filters or
 * sort have changed since (`activeViewModified`). The menu lists the Views
 * (Enter loads one) and then the actions, each a named menu item the arrows
 * reach: Save changes, Save as new view, Rename view, Delete view, and Set
 * as default or Stop using as default for the page. The actions apply to the
 * active View; to rename another, load it first. A View holds the filters,
 * sort and presentation, never the page's own filters, the search text or
 * pins.
 */
const ViewsMenu = ({
  listState,
  context,
  permanentFilters = NO_FILTERS,
  currentTableColumns = null,
  onViewColumns,
}: Props) => {
  const artifactType = presetArtifactType(context);
  const label = contextLabel(context);
  const presetsQuery = useFilterPresets();
  const defaultsQuery = useDefaultPresets();
  const views = presetsForContext(presetsQuery.data, context);
  const defaultId = defaultsQuery.data?.defaults[context] ?? null;
  const { activeView, activeViewModified } = listState;

  const saveView = useSaveView();
  const overwriteView = useOverwriteView();
  const renameView = useRenameView();
  const deleteView = useDeleteView();
  const setDefaultView = useSetDefaultView();
  const busy =
    saveView.isPending ||
    overwriteView.isPending ||
    renameView.isPending ||
    deleteView.isPending ||
    setDefaultView.isPending;

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [isOpen, setIsOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onMenuKeyDown = useRovingFocus(menuRef, { itemSelector: ITEMS });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const isDefault = activeView !== null && activeView.id === defaultId;
  const name = activeView ? `Views: ${activeView.name}` : "Views";
  const modified = activeView !== null && activeViewModified;

  // The list as a View stores it: not the page's filters, the search or pins
  const currentState = (): OverwriteViewBody => {
    const permanentKeys = new Set(Object.keys(permanentFilters));
    return {
      filters: Object.fromEntries(
        Object.entries(listState.filtersBeforeView).filter(
          ([key]) => !permanentKeys.has(key)
        )
      ),
      sort: listState.sort.field,
      direction: listState.sort.direction,
      viewMode: listState.viewMode,
      zoomLevel: listState.zoomLevel,
      gridDensity: listState.gridDensity,
      tableColumns:
        listState.viewMode === "table"
          ? storedColumns(currentTableColumns)
          : null,
      perPage: listState.perPage,
    };
  };

  const closeMenu = () => setIsOpen(false);

  const openDialog = (next: Dialog) => {
    closeMenu();
    setDialogError(null);
    setDialog(next);
  };

  const fail = (error: unknown, fallback: string) =>
    setToast({ variant: "error", text: getErrorMessage(error, fallback) });

  const handleLoad = (view: SavedPreset) => {
    listState.loadView(view);
    onViewColumns?.(presetColumnsOf(view.tableColumns));
    closeMenu();
  };

  const handleSaveChanges = async () => {
    closeMenu();
    if (!activeView) return;
    try {
      const result = await overwriteView.mutateAsync({
        artifactType,
        presetId: activeView.id,
        body: currentState(),
      });
      setToast(
        result.conflict
          ? { variant: "error", text: STALE }
          : { variant: "success", text: `Saved "${activeView.name}"` }
      );
    } catch (error) {
      fail(error, "Failed to save the view");
    }
  };

  const handleSaveAsNew = async (viewName: string, setAsDefault: boolean) => {
    setDialogError(null);
    try {
      const result = await saveView.mutateAsync({
        artifactType,
        context,
        name: viewName,
        ...currentState(),
        setAsDefault,
      });
      if (result.conflict) {
        setDialogError(conflictMessage(result.reason, viewName));
        return;
      }
      setDialog(null);
      listState.setActiveView(result.data.preset.id);
      setToast({ variant: "success", text: `Saved "${viewName}"` });
    } catch (error) {
      setDialogError(getErrorMessage(error, "Failed to save the view"));
    }
  };

  const handleRename = async (viewName: string) => {
    if (!activeView) return;
    setDialogError(null);
    try {
      const result = await renameView.mutateAsync({
        artifactType,
        presetId: activeView.id,
        name: viewName,
      });
      if (result.conflict) {
        setDialogError(conflictMessage(result.reason, viewName));
        return;
      }
      setDialog(null);
      setToast({ variant: "success", text: `Renamed to "${viewName}"` });
    } catch (error) {
      setDialogError(getErrorMessage(error, "Failed to rename the view"));
    }
  };

  const handleDelete = async () => {
    closeMenu();
    if (!activeView) return;
    const view = activeView;
    if (
      !(await confirm({
        title: "Delete view?",
        message: `Delete view "${view.name}"?`,
        confirmText: "Delete",
      }))
    ) {
      return;
    }
    try {
      const result = await deleteView.mutateAsync({
        artifactType,
        presetId: view.id,
      });
      if (result.conflict) {
        setToast({ variant: "error", text: STALE });
        return;
      }
      listState.setActiveView(null);
      setToast({ variant: "success", text: `Deleted "${view.name}"` });
    } catch (error) {
      fail(error, "Failed to delete the view");
    }
  };

  const handleToggleDefault = async () => {
    closeMenu();
    if (!activeView) return;
    try {
      const result = await setDefaultView.mutateAsync({
        context,
        presetId: isDefault ? null : activeView.id,
      });
      setToast(
        result.conflict
          ? { variant: "error", text: STALE }
          : {
              variant: "success",
              text: isDefault
                ? `"${activeView.name}" is no longer the default for ${label}`
                : `"${activeView.name}" is the default for ${label}`,
            }
      );
    } catch (error) {
      fail(error, "Failed to change the default view");
    }
  };

  const itemClass =
    "flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-sm transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  const actions = [
    {
      key: "save",
      text: "Save changes",
      icon: LucideSave,
      disabled: !modified || busy,
      onSelect: () => void handleSaveChanges(),
    },
    {
      key: "save-as",
      text: "Save as new view",
      icon: LucidePlus,
      disabled: busy,
      onSelect: () => openDialog("save"),
    },
    {
      key: "rename",
      text: "Rename view",
      icon: LucidePencil,
      disabled: !activeView || busy,
      onSelect: () => openDialog("rename"),
    },
    {
      key: "delete",
      text: "Delete view",
      icon: LucideTrash2,
      disabled: !activeView || busy,
      onSelect: () => void handleDelete(),
    },
    {
      key: "default",
      text: isDefault
        ? `Stop using as default for ${label}`
        : `Set as default for ${label}`,
      icon: isDefault ? LucidePinOff : LucidePin,
      disabled: !activeView || busy,
      onSelect: () => void handleToggleDefault(),
    },
  ];

  return (
    <div className="relative" data-tv-search-item="views">
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <StatusMessage variant={toast.variant} message={toast.text} />
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 h-[34px] rounded-lg text-sm transition-colors"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
        aria-label={modified ? `${name}, modified` : name}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={modified ? `${name} (modified)` : name}
      >
        <LucideBookmark size={16} aria-hidden="true" />
        <span className="max-w-[14rem] truncate">{name}</span>
        {modified && (
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--accent-primary)" }}
          />
        )}
        <LucideChevronDown
          size={14}
          aria-hidden="true"
          style={{
            color: "var(--text-tertiary)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        />
      </button>

      <Popover
        anchorRef={buttonRef}
        open={isOpen}
        onClose={closeMenu}
        label="Views"
      >
        <div
          ref={menuRef}
          role="menu"
          aria-label="Views"
          onKeyDown={onMenuKeyDown}
          className="p-1 flex flex-col gap-0.5 min-w-[14rem] max-w-[20rem] max-h-[70vh] overflow-y-auto"
        >
          {views.length === 0 ? (
            <div
              className="px-2 py-1.5 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              No saved views
            </div>
          ) : (
            views.map((view) => {
              const checked = activeView?.id === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  data-popover-focus={checked ? "" : undefined}
                  onClick={() => handleLoad(view)}
                  className={itemClass}
                  style={{
                    color: checked
                      ? "var(--accent-primary)"
                      : "var(--text-primary)",
                  }}
                >
                  <LucideCheck
                    size={14}
                    aria-hidden="true"
                    style={{ visibility: checked ? "visible" : "hidden" }}
                  />
                  <span className="flex-1 truncate">{view.name}</span>
                  {view.id === defaultId && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Default
                    </span>
                  )}
                </button>
              );
            })
          )}

          <div
            role="separator"
            className="my-1 border-t"
            style={{ borderColor: "var(--border-color)" }}
          />

          {actions.map(({ key, text, icon: Icon, disabled, onSelect }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={onSelect}
              className={itemClass}
              style={{ color: "var(--text-secondary)" }}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{text}</span>
            </button>
          ))}
        </div>
      </Popover>

      {dialog === "save" && (
        <ViewNameDialog
          isOpen
          title="Save view"
          defaultLabel={label}
          saving={saveView.isPending}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onSave={(viewName, setAsDefault) =>
            void handleSaveAsNew(viewName, setAsDefault)
          }
        />
      )}
      {dialog === "rename" && activeView && (
        <ViewNameDialog
          isOpen
          title="Rename view"
          initialName={activeView.name}
          saving={renameView.isPending}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onSave={(viewName) => void handleRename(viewName)}
        />
      )}

      {confirmDialog}
    </div>
  );
};

export default ViewsMenu;
