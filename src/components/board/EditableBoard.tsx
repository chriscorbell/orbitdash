import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BoardColumns } from "@/components/board/BoardColumns";
import { BulkActionBar } from "@/components/board/BulkActionBar";
import { SelectToggle } from "@/components/board/SelectToggle";
import { ServiceActionsMenu } from "@/components/board/ServiceActionsMenu";
import { useBulkServiceActions } from "@/components/board/useBulkServiceActions";
import { IconButton } from "@/components/common/IconButton";
import { ServiceCardFace } from "@/components/ServiceCard";
import { moveItem, type BoardGroup, type ServiceMove } from "@/lib/board-groups";
import { cardListClassName, estimateCategoryHeight } from "@/lib/board-layout";
import { groupSelectionState, toggleGroupSelection, toggleSelection } from "@/lib/board-selection";
import type { LinkTarget } from "@/lib/link-target";
import { cn } from "@/lib/utils";
import type { BoardMode, CardDensity } from "@shared/dashboard-settings";
import type { Category, Service } from "@shared/types";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

const CATEGORY_PREFIX = "category:";
const LIST_PREFIX = "list:";

const categoryId = (key: string) => `${CATEGORY_PREFIX}${key}`;
const listId = (key: string) => `${LIST_PREFIX}${key}`;
const isCategoryId = (id: UniqueIdentifier) => String(id).startsWith(CATEGORY_PREFIX);
const isListId = (id: UniqueIdentifier) => String(id).startsWith(LIST_PREFIX);

type Containers = Record<string, string[]>;

type DragState =
  | { type: "category"; key: string; overKey: string | null }
  | {
      type: "service";
      id: string;
      containers: Containers;
      origin: { key: string; index: number };
    };

/** Categories never shift around while one is dragged; the drop target is highlighted instead. */
const noShift = () => null;

const MENU_POSITION: Record<CardDensity, string> = {
  compact: "right-1.5 top-1/2 -translate-y-1/2",
  comfortable: "right-1.5 top-1.5",
  tiles: "right-1 top-1",
};

const ADD_TILE: Record<CardDensity, string> = {
  compact: "h-9",
  comfortable: "h-12",
  tiles: "min-h-[6.25rem] flex-col",
};

function toContainers(groups: readonly BoardGroup[]): Containers {
  return Object.fromEntries(
    groups.map((group) => [group.key, group.services.map((service) => service.id)])
  );
}

function findContainer(containers: Containers, id: UniqueIdentifier): string | undefined {
  const value = String(id);
  if (value.startsWith(LIST_PREFIX)) return value.slice(LIST_PREFIX.length);
  return Object.keys(containers).find((key) => containers[key].includes(value));
}

/** The selected cards, and the last one toggled, where a shift-click range starts. */
interface Selection {
  anchor: string | null;
  ids: ReadonlySet<string>;
}

const NO_SELECTION: Selection = { anchor: null, ids: new Set() };

/** Selection checkboxes show on hover or focus until something is selected, then on every card. */
const REVEAL_TOGGLE =
  "opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 pointer-coarse:opacity-100";

export interface EditableBoardProps {
  /** Every category, empty ones included, for the bulk bar's Move menu. */
  categories: readonly Category[];
  density: CardDensity;
  groups: readonly BoardGroup[];
  /** Which URL the card menus open, as on the cards outside edit mode. */
  linkTarget: LinkTarget;
  mode: BoardMode;
  renamingKey: string | null;
  onAddService: (group: BoardGroup) => void;
  onDeleteCategory: (group: BoardGroup) => void;
  onDeleteService: (service: Service) => void;
  onDuplicateService: (service: Service) => void;
  onEditService: (service: Service) => void;
  onMoveService: (move: ServiceMove) => void;
  onRenameCategory: (id: string, name: string) => void;
  onRenamingKeyChange: (key: string | null) => void;
  onReorderCategories: (ids: string[]) => void;
}

/**
 * The board in edit mode. Cards drag within and between categories, categories drag by their
 * handle, names edit in place, and every category ends with an add tile. Cards can also be
 * selected (shift-click for a run, or a whole category) for the bulk bar. Loaded on demand, so
 * dnd-kit only downloads when someone edits.
 */
export function EditableBoard({
  categories,
  density,
  groups,
  linkTarget,
  mode,
  renamingKey,
  onAddService,
  onDeleteCategory,
  onDeleteService,
  onDuplicateService,
  onEditService,
  onMoveService,
  onRenameCategory,
  onRenamingKeyChange,
  onReorderCategories,
}: EditableBoardProps) {
  const [drag, setDragState] = useState<DragState | null>(null);
  // Collision detection and drag handlers run outside render, so they read the drag from a ref.
  const dragRef = useRef<DragState | null>(null);
  const setDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDragState(next);
  }, []);
  const baseContainers = useMemo(() => toContainers(groups), [groups]);
  const containers = drag?.type === "service" ? drag.containers : baseContainers;
  const lastOverRef = useRef<UniqueIdentifier | null>(null);
  // A drag that ends where it started still fires a click; this swallows it.
  const suppressClickRef = useRef(false);

  const servicesById = useMemo(
    () =>
      new Map(groups.flatMap((group) => group.services.map((service) => [service.id, service]))),
    [groups]
  );
  const groupsByKey = useMemo(() => new Map(groups.map((group) => [group.key, group])), [groups]);
  const sortableCategoryIds = useMemo(
    () => groups.filter((group) => group.categoryId !== null).map((group) => categoryId(group.key)),
    [groups]
  );

  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const boardRef = useRef<HTMLDivElement>(null);
  const bulk = useBulkServiceActions();
  // Board order, for shift-click ranges.
  const orderedIds = useMemo(
    () => groups.flatMap((group) => group.services.map((service) => service.id)),
    [groups]
  );
  // Services deleted or moved away elsewhere drop out of the selection by themselves.
  const selectedIds = useMemo(
    () => [...selection.ids].filter((id) => servicesById.has(id)),
    [selection.ids, servicesById]
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selecting = selectedIds.length > 0;

  const toggleService = useCallback(
    (id: string, range: boolean) =>
      setSelection((current) => ({
        anchor: id,
        ids: toggleSelection(current.ids, id, { anchor: current.anchor, order: orderedIds, range }),
      })),
    [orderedIds]
  );
  const toggleGroup = useCallback(
    (ids: string[]) =>
      setSelection((current) => ({ anchor: null, ids: toggleGroupSelection(current.ids, ids) })),
    []
  );
  const clearSelection = useCallback(() => setSelection(NO_SELECTION), []);

  /** Clears the selection after a bulk action, moving focus off the bar that goes with it. */
  const finishBulk = async (action: Promise<boolean>) => {
    if (!(await action)) return;
    setSelection(NO_SELECTION);
    boardRef.current?.focus({ preventScroll: true });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short press-and-hold, so touch scrolling still works in edit mode.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter is left free for opening a card's editor.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    })
  );

  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (dragRef.current?.type === "category") {
      // Categories are tall, so aim by the pointer rather than the dragged category's center;
      // keyboard drags have no pointer and fall back to the nearest category.
      const categories = {
        ...args,
        droppableContainers: args.droppableContainers.filter((entry) => isCategoryId(entry.id)),
      };
      const underPointer = pointerWithin(categories);
      return underPointer.length > 0 ? underPointer : closestCenter(categories);
    }

    const candidates = args.droppableContainers.filter((entry) => !isCategoryId(entry.id));
    const scoped = { ...args, droppableContainers: candidates };
    const pointerHits = pointerWithin(scoped);
    let overId = getFirstCollision(
      pointerHits.length > 0 ? pointerHits : rectIntersection(scoped),
      "id"
    );

    if (overId == null) {
      return lastOverRef.current ? [{ id: lastOverRef.current }] : [];
    }
    if (isListId(overId)) {
      // Over a category's list: aim at its nearest card so the drop lands in the right spot.
      const current = dragRef.current;
      const items =
        current?.type === "service"
          ? (current.containers[String(overId).slice(LIST_PREFIX.length)] ?? [])
          : [];
      if (items.length > 0) {
        overId =
          closestCenter({
            ...args,
            droppableContainers: candidates.filter((entry) => items.includes(String(entry.id))),
          })[0]?.id ?? overId;
      }
    }
    lastOverRef.current = overId;
    return [{ id: overId }];
  }, []);

  const describe = useCallback(
    (id: UniqueIdentifier | undefined) => {
      if (id === undefined) return "";
      const value = String(id);
      if (value.startsWith(CATEGORY_PREFIX)) {
        return `${groupsByKey.get(value.slice(CATEGORY_PREFIX.length))?.name ?? ""} category`;
      }
      if (value.startsWith(LIST_PREFIX)) {
        return groupsByKey.get(value.slice(LIST_PREFIX.length))?.name ?? "";
      }
      return servicesById.get(value)?.name ?? "";
    },
    [groupsByKey, servicesById]
  );

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${describe(active.id)} is over ${describe(over.id)}.`
          : `${describe(active.id)} is not over a drop area.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `${describe(active.id)} was dropped on ${describe(over.id)}.`
          : `${describe(active.id)} was dropped.`,
      onDragCancel: ({ active }) => `Moving ${describe(active.id)} was cancelled.`,
    }),
    [describe]
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    lastOverRef.current = null;
    if (isCategoryId(active.id)) {
      setDrag({
        type: "category",
        key: String(active.id).slice(CATEGORY_PREFIX.length),
        overKey: null,
      });
      return;
    }
    const id = String(active.id);
    const key = findContainer(baseContainers, id);
    if (!key) return;
    setDrag({
      type: "service",
      id,
      containers: baseContainers,
      origin: { key, index: baseContainers[key].indexOf(id) },
    });
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const current = dragRef.current;
    if (!current || !over) return;

    if (current.type === "category") {
      const overKey = isCategoryId(over.id) ? String(over.id).slice(CATEGORY_PREFIX.length) : null;
      if (overKey !== current.overKey) setDrag({ ...current, overKey });
      return;
    }

    // Crossing into another category moves the card there right away, so the list makes room.
    const activeKey = findContainer(current.containers, active.id);
    const overKey = findContainer(current.containers, over.id);
    if (!activeKey || !overKey || activeKey === overKey) return;

    const overItems = current.containers[overKey];
    let index = overItems.length;
    if (!isListId(over.id)) {
      const overIndex = overItems.indexOf(String(over.id));
      const translated = active.rect.current.translated;
      const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
      index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : overItems.length;
    }

    setDrag({
      ...current,
      containers: {
        ...current.containers,
        [activeKey]: current.containers[activeKey].filter((id) => id !== current.id),
        [overKey]: [...overItems.slice(0, index), current.id, ...overItems.slice(index)],
      },
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragRef.current;
    setDrag(null);
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    });
    if (!current) return;

    if (current.type === "category") {
      if (!over || !isCategoryId(over.id)) return;
      const order = sortableCategoryIds.map((id) => id.slice(CATEGORY_PREFIX.length));
      const from = order.indexOf(current.key);
      const to = order.indexOf(String(over.id).slice(CATEGORY_PREFIX.length));
      if (from >= 0 && to >= 0 && from !== to) onReorderCategories(moveItem(order, from, to));
      return;
    }

    const activeKey = findContainer(current.containers, active.id);
    if (!activeKey) return;
    let items = current.containers[activeKey];
    if (over && findContainer(current.containers, over.id) === activeKey) {
      const from = items.indexOf(current.id);
      const to = isListId(over.id) ? items.length - 1 : items.indexOf(String(over.id));
      if (from >= 0 && to >= 0 && from !== to) items = moveItem(items, from, to);
    }

    const index = items.indexOf(current.id);
    if (activeKey === current.origin.key && index === current.origin.index) return;
    const group = groupsByKey.get(activeKey);
    if (!group) return;
    onMoveService({
      id: current.id,
      categoryId: group.categoryId,
      categoryName: group.categoryId === null ? null : group.name,
      index,
    });
  };

  const handleDragCancel = () => {
    setDrag(null);
  };

  // Same estimate as the normal board, so categories keep their columns when editing starts.
  const heightOf = useCallback(
    (group: BoardGroup) => estimateCategoryHeight(group.services.length, density, false),
    [density]
  );

  const activeService = drag?.type === "service" ? servicesById.get(drag.id) : undefined;
  const activeCategory = drag?.type === "category" ? groupsByKey.get(drag.key) : undefined;

  return (
    <div
      ref={boardRef}
      // Takes focus after a bulk action removes the bar, so keyboard users stay on the board.
      tabIndex={-1}
      // Room below the last row, so the bulk bar never covers it.
      className={cn("outline-none", selecting && "pb-20")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && selecting && !drag && !event.defaultPrevented) {
          clearSelection();
        }
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To pick up a card or category, press Space. Use the arrow keys to move it, then Space to drop it or Escape to cancel. Press Enter on a card to edit it.",
          },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={sortableCategoryIds} strategy={noShift}>
          <BoardColumns
            density={density}
            groups={groups}
            mode={mode}
            heightOf={heightOf}
            renderGroup={(group) => (
              <EditableCategory
                key={group.key}
                density={density}
                group={group}
                animateMoves={drag?.type !== "service"}
                isDropTarget={
                  drag?.type === "category" && drag.overKey === group.key && drag.key !== group.key
                }
                linkTarget={linkTarget}
                listClassName={cardListClassName(mode, density)}
                renaming={renamingKey === group.key}
                selected={selected}
                selecting={selecting}
                serviceIds={containers[group.key] ?? []}
                servicesById={servicesById}
                suppressClickRef={suppressClickRef}
                onAddService={onAddService}
                onDeleteCategory={onDeleteCategory}
                onDeleteService={onDeleteService}
                onDuplicateService={onDuplicateService}
                onEditService={onEditService}
                onRenameCategory={onRenameCategory}
                onRenamingKeyChange={onRenamingKeyChange}
                onToggleGroup={toggleGroup}
                onToggleService={toggleService}
              />
            )}
          />
        </SortableContext>
        <DragOverlay>
          {activeService ? (
            <ServiceCardFace
              service={activeService}
              density={density}
              className="cursor-grabbing shadow-xl ring-1 ring-brand/50"
            />
          ) : activeCategory ? (
            <div className="inline-flex cursor-grabbing items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-semibold shadow-xl ring-1 ring-brand/50">
              <GripVertical aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
              {activeCategory.name}
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {activeCategory.services.length}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {selecting && (
        <BulkActionBar
          busy={bulk.busy}
          categories={categories}
          count={selectedIds.length}
          onChecks={(change) => void bulk.setChecks(selectedIds, change)}
          onClear={clearSelection}
          onDelete={() => void finishBulk(bulk.remove(selectedIds))}
          onMove={(category) => void finishBulk(bulk.move(selectedIds, category))}
        />
      )}
    </div>
  );
}

interface EditableCategoryProps {
  /** Off while a card is dragged, so dnd-kit measures categories where they really are. */
  animateMoves: boolean;
  density: CardDensity;
  group: BoardGroup;
  isDropTarget: boolean;
  linkTarget: LinkTarget;
  listClassName: string;
  renaming: boolean;
  selected: ReadonlySet<string>;
  /** Something is selected, so every checkbox shows. */
  selecting: boolean;
  serviceIds: string[];
  servicesById: Map<string, Service>;
  suppressClickRef: React.RefObject<boolean>;
  onAddService: (group: BoardGroup) => void;
  onDeleteCategory: (group: BoardGroup) => void;
  onDeleteService: (service: Service) => void;
  onDuplicateService: (service: Service) => void;
  onEditService: (service: Service) => void;
  onRenameCategory: (id: string, name: string) => void;
  onRenamingKeyChange: (key: string | null) => void;
  onToggleGroup: (ids: string[]) => void;
  onToggleService: (id: string, range: boolean) => void;
}

function EditableCategory({
  animateMoves,
  density,
  group,
  isDropTarget,
  linkTarget,
  listClassName,
  renaming,
  selected,
  selecting,
  serviceIds,
  servicesById,
  suppressClickRef,
  onAddService,
  onDeleteCategory,
  onDeleteService,
  onDuplicateService,
  onEditService,
  onRenameCategory,
  onRenamingKeyChange,
  onToggleGroup,
  onToggleService,
}: EditableCategoryProps) {
  const isCategory = group.categoryId !== null;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useSortable({
    id: categoryId(group.key),
    disabled: !isCategory,
  });
  const { setNodeRef: setListRef } = useDroppable({ id: listId(group.key) });

  return (
    <section
      ref={setNodeRef}
      data-flip-key={animateMoves ? `category:${group.key}` : undefined}
      aria-label={`${group.name} category`}
      className={cn(
        "space-y-3 rounded-xl transition-[opacity,box-shadow] duration-200",
        isDragging && "opacity-40",
        isDropTarget && "ring-2 ring-brand/60 ring-offset-4 ring-offset-background"
      )}
    >
      <div className="group flex min-h-8 items-center gap-1">
        {isCategory && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Move ${group.name} category`}
            className="-ml-1 flex h-7 w-6 shrink-0 cursor-grab touch-none pointer-coarse:h-10 pointer-coarse:w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
        {renaming && isCategory ? (
          <CategoryNameInput
            name={group.name}
            onCancel={() => onRenamingKeyChange(null)}
            onSubmit={(name) => {
              onRenamingKeyChange(null);
              if (name !== group.name) onRenameCategory(group.categoryId!, name);
            }}
          />
        ) : isCategory ? (
          <button
            type="button"
            aria-label={`Rename ${group.name} category`}
            className="group/name flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onRenamingKeyChange(group.key)}
          >
            <span className="truncate">{group.name}</span>
            <Pencil
              aria-hidden="true"
              className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100 pointer-coarse:opacity-100"
            />
          </button>
        ) : (
          <span className="px-1 text-sm font-semibold text-muted-foreground">{group.name}</span>
        )}
        <span className="text-xs tabular-nums text-muted-foreground/60">{serviceIds.length}</span>
        {serviceIds.length > 0 && (
          // After the count, so it takes no room from the name while hidden.
          <SelectToggle
            checked={groupSelectionState(selected, serviceIds)}
            label={`Select all in ${group.name}`}
            className={cn("ml-1.5", !selecting && REVEAL_TOGGLE)}
            onToggle={() => onToggleGroup(serviceIds)}
          />
        )}
        {isCategory && (
          <IconButton
            variant="ghost"
            size="icon-sm"
            tooltip="Delete category"
            aria-label={`Delete ${group.name} category`}
            className="ml-auto shrink-0 text-muted-foreground hover:text-destructive pointer-coarse:size-10"
            onClick={() => onDeleteCategory(group)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
      <SortableContext items={serviceIds} strategy={rectSortingStrategy}>
        <div ref={setListRef} className={cn(listClassName, "rounded-xl")}>
          {serviceIds.map((id) => {
            const service = servicesById.get(id);
            return service ? (
              <SortableService
                key={id}
                density={density}
                linkTarget={linkTarget}
                selected={selected.has(id)}
                selecting={selecting}
                service={service}
                suppressClickRef={suppressClickRef}
                onDelete={onDeleteService}
                onDuplicate={onDuplicateService}
                onEdit={onEditService}
                onToggle={onToggleService}
              />
            ) : null;
          })}
          <button
            type="button"
            aria-label={`Add a service to ${group.name}`}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:bg-brand-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ADD_TILE[density]
            )}
            onClick={() => onAddService(group)}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span className={density === "tiles" ? "text-xs" : undefined}>Add service</span>
          </button>
        </div>
      </SortableContext>
    </section>
  );
}

function CategoryNameInput({
  name,
  onCancel,
  onSubmit,
}: {
  name: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const doneRef = useRef(false);
  const finish = (value: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = value?.trim() ?? "";
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <input
      // Opens focused when the user asks to rename, or right after a category is created.
      autoFocus
      defaultValue={name}
      aria-label="Category name"
      maxLength={60}
      className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") {
          event.stopPropagation();
          finish(null);
        }
      }}
    />
  );
}

interface SortableServiceProps {
  density: CardDensity;
  linkTarget: LinkTarget;
  selected: boolean;
  selecting: boolean;
  service: Service;
  suppressClickRef: React.RefObject<boolean>;
  onDelete: (service: Service) => void;
  onDuplicate: (service: Service) => void;
  onEdit: (service: Service) => void;
  onToggle: (id: string, range: boolean) => void;
}

const SortableService = memo(function SortableService({
  density,
  linkTarget,
  selected,
  selecting,
  service,
  suppressClickRef,
  onDelete,
  onDuplicate,
  onEdit,
  onToggle,
}: SortableServiceProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onEdit(service);
      return;
    }
    listeners?.onKeyDown?.(event);
  };

  // Shift-, Ctrl- or Cmd-click selects instead of opening the editor, as in a file manager.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) onToggle(service.id, event.shiftKey);
    else onEdit(service);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group relative", isDragging && "opacity-30")}
    >
      <SelectToggle
        checked={selected}
        label={`Select ${service.name}`}
        className={cn("absolute -top-1.5 -left-1.5 z-10", !selecting && !selected && REVEAL_TOGGLE)}
        onToggle={(range) => onToggle(service.id, range)}
      />
      <div
        {...attributes}
        {...listeners}
        aria-label={`${service.name}. Press Enter to edit or Space to move.`}
        className="cursor-grab rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <ServiceCardFace
          service={service}
          density={density}
          className={cn(density !== "tiles" && "pr-6", selected && "ring-2 ring-brand/60")}
        />
      </div>
      <ServiceActionsMenu
        className={MENU_POSITION[density]}
        linkTarget={linkTarget}
        service={service}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
      />
    </div>
  );
});
