import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from "react";
import type { Board, Category, Layout, Link } from "../../shared/types.ts";
import { linkIconSrc } from "../api.ts";
import { type Containers, groupBoard, toContainers, toLayout, UNGROUPED } from "../lib/board.ts";
import { estimateCategoryHeight } from "../lib/columns.ts";
import { CategorySection, Columns } from "./Layout.tsx";
import { LinkIcon } from "./LinkIcon.tsx";

export interface EditBoardProps {
  board: Board;
  onArrange: (layout: Layout) => void;
  onMoveCategory: (id: string, offset: number) => void;
  onEditLink: (link: Link) => void;
  onAddLink: (category: string) => void;
  onRenameCategory: (category: Category) => void;
  onDeleteCategory: (category: Category) => void;
}

function CardFace({ link, overlay = false }: { link: Link; overlay?: boolean }) {
  return (
    <span className="link-card" data-editing="" data-overlay={overlay || undefined}>
      <LinkIcon src={linkIconSrc(link)} />
      <span className="link-name">{link.name}</span>
      <GripVertical className="grip" aria-hidden="true" />
    </span>
  );
}

function SortableLink({ link, onEdit }: { link: Link; onEdit: (link: Link) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
  });

  return (
    <li
      ref={setNodeRef}
      className="sortable"
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`${link.name}. Enter edits, Space picks it up to move it.`}
        onClick={() => onEdit(link)}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEdit(link);
            return;
          }
          listeners?.onKeyDown?.(event);
        }}
      >
        <CardFace link={link} />
      </div>
    </li>
  );
}

/** A list links can be dropped into, even while it's empty. */
function DropList({
  id,
  ids,
  grid = false,
  children,
}: {
  id: string;
  ids: string[];
  grid?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext
      id={id}
      items={ids}
      strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}
    >
      <ul
        ref={setNodeRef}
        className={grid ? "link-grid" : "link-list"}
        data-drop-target=""
        data-over={isOver || undefined}
        data-empty={ids.length === 0 || undefined}
      >
        {children}
      </ul>
    </SortableContext>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="button"
      data-variant="ghost"
      data-icon-only=""
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Edit mode: drag cards within and between categories, click one to edit it. */
export default function EditBoard({
  board,
  onArrange,
  onMoveCategory,
  onEditLink,
  onAddLink,
  onRenameCategory,
  onDeleteCategory,
}: EditBoardProps) {
  // Only set while a drag is in progress; otherwise the board is the truth.
  const [dragging, setDragging] = useState<{ containers: Containers; activeId: string } | null>(
    null
  );
  const lastDragEnd = useRef(0);
  const containers = useMemo(() => dragging?.containers ?? toContainers(board), [dragging, board]);
  const links = useMemo(() => new Map(board.links.map((link) => [link.id, link])), [board.links]);
  const { ungrouped, groups } = groupBoard(board);
  const showUngrouped = ungrouped.length > 0 || board.categories.length === 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter is left for opening the editor.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  function containerOf(state: Containers, id: string): string | undefined {
    if (id in state) return id;
    return Object.keys(state).find((key) => state[key].includes(id));
  }

  function handleDragStart({ active }: DragStartEvent) {
    setDragging({ containers: toContainers(board), activeId: String(active.id) });
  }

  // Moving into another list happens while dragging, so the card makes room where it will land.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const translated = active.rect.current.translated;
    const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;

    setDragging((current) => {
      if (!current) return current;
      const state = current.containers;
      const from = containerOf(state, activeId);
      const to = containerOf(state, overId);
      if (!from || !to || from === to) return current;

      const target = state[to];
      const overIndex = target.indexOf(overId);
      const index = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0);
      return {
        activeId,
        containers: {
          ...state,
          [from]: state[from].filter((id) => id !== activeId),
          [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
        },
      };
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    lastDragEnd.current = Date.now();
    if (!dragging) return;
    let state = dragging.containers;
    const activeId = String(active.id);
    const from = containerOf(state, activeId);
    const to = over ? containerOf(state, String(over.id)) : undefined;
    if (from && to && from === to && over && over.id !== active.id) {
      const list = state[from];
      const overIndex = list.indexOf(String(over.id));
      if (overIndex >= 0) {
        state = { ...state, [from]: arrayMove(list, list.indexOf(activeId), overIndex) };
      }
    }
    setDragging(null);
    if (over) {
      onArrange(
        toLayout(
          state,
          board.categories.map((category) => category.id)
        )
      );
    }
  }

  function edit(link: Link) {
    // Releasing a drag where it started also fires a click; that one shouldn't open the editor.
    if (Date.now() - lastDragEnd.current > 250) onEditLink(link);
  }

  const renderLinks = (ids: string[]) =>
    ids.flatMap((id) => {
      const link = links.get(id);
      return link ? [<SortableLink key={id} link={link} onEdit={edit} />] : [];
    });

  const active = dragging ? links.get(dragging.activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="board" data-editing="">
        {showUngrouped && (
          <section className="category" data-ungrouped="">
            <header className="category-header">
              <h2 className="category-name">No category</h2>
              <div className="category-actions">
                <IconButton label="Add a link without a category" onClick={() => onAddLink("")}>
                  <Plus />
                </IconButton>
              </div>
            </header>
            <DropList id={UNGROUPED} ids={containers[UNGROUPED]} grid>
              {renderLinks(containers[UNGROUPED])}
            </DropList>
          </section>
        )}
        <Columns
          items={groups}
          keyOf={(group) => group.category.id}
          heightOf={(group) => estimateCategoryHeight(group.links.length)}
          render={({ category }, index) => (
            <CategorySection
              name={category.name}
              index={index}
              actions={
                <div className="category-actions">
                  <IconButton
                    label={`Add a link to ${category.name}`}
                    onClick={() => onAddLink(category.name)}
                  >
                    <Plus />
                  </IconButton>
                  <IconButton
                    label={`Rename ${category.name}`}
                    onClick={() => onRenameCategory(category)}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`Move ${category.name} earlier`}
                    disabled={index === 0}
                    onClick={() => onMoveCategory(category.id, -1)}
                  >
                    <ChevronUp />
                  </IconButton>
                  <IconButton
                    label={`Move ${category.name} later`}
                    disabled={index === groups.length - 1}
                    onClick={() => onMoveCategory(category.id, 1)}
                  >
                    <ChevronDown />
                  </IconButton>
                  <IconButton
                    label={`Delete ${category.name}`}
                    onClick={() => onDeleteCategory(category)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              }
            >
              <DropList id={category.id} ids={containers[category.id] ?? []}>
                {renderLinks(containers[category.id] ?? [])}
              </DropList>
            </CategorySection>
          )}
        />
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {active ? <CardFace link={active} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
