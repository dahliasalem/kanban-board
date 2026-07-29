"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { CardDetailModal } from "@/components/CardDetailModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OverflowMenu } from "@/components/OverflowMenu";
import { TopBar } from "@/components/TopBar";
import { getBoardCacheEntry, setBoardCacheEntry } from "@/lib/board-cache";
import {
  createCard,
  createColumn,
  deleteColumn,
  generateCardId,
  generateColumnId,
  moveCard,
  renameBoard,
  renameColumn,
  reorderColumn,
  subscribeToBoard,
  subscribeToCards,
  subscribeToColumns,
  type Board,
  type Card,
  type Column,
} from "@/lib/boards";

type Rect = { top: number; left: number; width: number; height: number } | null;

// Determines whether a drop should insert before or after the target,
// based on which half of the target the dragged item's center landed in.
// Without this, dropping "on" an item always inserts before it, which
// makes it impossible to ever reach the very end of a list.
function resolveDropSide(
  activeRect: Rect,
  overRect: Rect,
  axis: "horizontal" | "vertical"
): "before" | "after" {
  if (!activeRect || !overRect) return "before";
  if (axis === "horizontal") {
    const activeCenterX = activeRect.left + activeRect.width / 2;
    const overCenterX = overRect.left + overRect.width / 2;
    return activeCenterX > overCenterX ? "after" : "before";
  }
  const activeCenterY = activeRect.top + activeRect.height / 2;
  const overCenterY = overRect.top + overRect.height / 2;
  return activeCenterY > overCenterY ? "after" : "before";
}

// Columns and cards (and column drop-zones, for empty columns) are all
// droppables in the same DndContext. Plain closestCenter would happily
// resolve "over" to a card nested inside some column while dragging a
// column — restrict candidates to the types relevant to what's being
// dragged, so a column drag only ever collides with other columns.
const collisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;
  const allowedTypes =
    activeType === "column" ? ["column"] : ["card", "column-dropzone"];
  const filtered = args.droppableContainers.filter((container) =>
    allowedTypes.includes(container.data.current?.type as string)
  );
  return closestCenter({ ...args, droppableContainers: filtered });
};

// Shown while board, columns, and cards are all still loading, so the page
// reveals real content once instead of the title popping in immediately
// followed by columns trailing in a moment later.
function BoardSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar />
      <div className="px-8 pb-2 pt-8">
        <div className="h-9 w-64 animate-pulse rounded-full bg-[#e7e0ec]" />
      </div>
      <div className="flex flex-1 gap-6 overflow-hidden p-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex h-fit w-72 flex-none flex-col gap-3 rounded-[24px] bg-[#f3edf7] p-4 shadow-sm"
          >
            <div className="h-5 w-24 animate-pulse rounded-full bg-[#e7e0ec]" />
            <div className="h-16 animate-pulse rounded-[16px] bg-[#e7e0ec]" />
            <div className="h-16 animate-pulse rounded-[16px] bg-[#e7e0ec]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  // Remounts the whole subtree on board switch so all state below —
  // including the loaded flags — resets to its initial values naturally,
  // instead of manually resetting state from inside an effect.
  return <BoardPageContent key={boardId} boardId={boardId} />;
}

function BoardPageContent({ boardId }: { boardId: string }) {
  const cached = getBoardCacheEntry(boardId);
  const [board, setBoard] = useState<Board | null>(cached?.board ?? null);
  const [columns, setColumns] = useState<Column[]>(cached?.columns ?? []);
  const [cards, setCards] = useState<Card[]>(cached?.cards ?? []);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [pendingColumns, setPendingColumns] = useState<Column[]>([]);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState("");
  const [boardLoaded, setBoardLoaded] = useState(cached !== undefined);
  const [columnsLoaded, setColumnsLoaded] = useState(cached !== undefined);
  const [cardsLoaded, setCardsLoaded] = useState(cached !== undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    // Board, columns, and cards each arrive over their own Firestore
    // listener at slightly different times. Real content is only revealed
    // once all three have reported at least once, so the page shows one
    // skeleton and then the fully-populated board, instead of the title
    // popping in first and the columns trailing in a moment later — unless
    // this board was already loaded earlier this session (see boardCache),
    // in which case the cached snapshot is shown immediately.
    const unsubBoard = subscribeToBoard(boardId, (b) => {
      setBoard(b);
      setBoardLoaded(true);
      setBoardCacheEntry(boardId, { board: b });
    });
    const unsubColumns = subscribeToColumns(boardId, (c) => {
      setColumns(c);
      setColumnsLoaded(true);
      setBoardCacheEntry(boardId, { columns: c });
    });
    const unsubCards = subscribeToCards(boardId, (c) => {
      setCards(c);
      setCardsLoaded(true);
      setBoardCacheEntry(boardId, { cards: c });
    });
    return () => {
      unsubBoard();
      unsubColumns();
      unsubCards();
    };
  }, [boardId]);

  const isLoading = !boardLoaded || !columnsLoaded || !cardsLoaded;

  const startRenameBoard = () => {
    if (!board) return;
    setBoardNameDraft(board.name);
    setEditingBoardName(true);
  };

  const commitRenameBoard = async () => {
    setEditingBoardName(false);
    const trimmed = boardNameDraft.trim();
    if (!board || !trimmed || trimmed === board.name) return;

    const previousName = board.name;
    setBoard((prev) => (prev ? { ...prev, name: trimmed } : prev));
    try {
      await renameBoard(boardId, trimmed);
    } catch (err) {
      console.error("Failed to rename board, reverting:", err);
      setBoard((prev) => (prev ? { ...prev, name: previousName } : prev));
    }
  };

  const handleAddColumn = async (e: FormEvent) => {
    e.preventDefault();
    const name = newColumnName.trim();
    if (!name) return;
    setNewColumnName("");
    setAddingColumn(false);

    const id = generateColumnId(boardId);
    setPendingColumns((prev) => [...prev, { id, name, position: "~" }]);

    try {
      await createColumn(boardId, name, id);
    } catch (err) {
      console.error("Failed to create column:", err);
    } finally {
      setPendingColumns((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const cancelAddColumn = () => {
    setNewColumnName("");
    setAddingColumn(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === "card") {
      setActiveCard(cards.find((c) => c.id === active.id) ?? null);
    } else if (active.data.current?.type === "column") {
      setActiveColumn(columns.find((c) => c.id === active.id) ?? null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "card") return;

    const activeId = active.id as string;
    if (activeId === over.id) return;

    const overData = over.data.current;
    const overColumnId =
      overData?.type === "card"
        ? (overData.columnId as string)
        : overData?.type === "column-dropzone"
          ? (overData.columnId as string)
          : null;
    if (!overColumnId) return;

    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === activeId);
      if (idx === -1 || prev[idx].columnId === overColumnId) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], columnId: overColumnId };
      return updated;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    setActiveColumn(null);
    if (!over) return;

    if (active.data.current?.type === "column") {
      if (active.id === over.id) return;
      const activeColumnData = columns.find((c) => c.id === active.id);
      if (!activeColumnData) return;
      const withoutActive = columns.filter((c) => c.id !== active.id);
      const overIndex = withoutActive.findIndex((c) => c.id === over.id);
      if (overIndex === -1) return;

      const side = resolveDropSide(active.rect.current.translated, over.rect, "horizontal");
      const insertIndex = side === "after" ? overIndex + 1 : overIndex;

      const previousColumns = columns;
      const reordered = [...withoutActive];
      reordered.splice(insertIndex, 0, activeColumnData);
      setColumns(reordered);

      const before = reordered[insertIndex - 1] ?? null;
      const after = reordered[insertIndex + 1] ?? null;
      try {
        await reorderColumn(boardId, active.id as string, before?.id ?? null, after?.id ?? null);
      } catch (err) {
        console.error("Failed to reorder column, reverting:", err);
        setColumns(previousColumns);
      }
      return;
    }

    if (active.data.current?.type === "card") {
      const activeCardId = active.id as string;
      const liveCard = cards.find((c) => c.id === activeCardId);
      if (!liveCard) return;
      const targetColumnId = liveCard.columnId;

      const siblings = cards
        .filter((c) => c.columnId === targetColumnId && c.id !== activeCardId)
        .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

      let insertIndex = siblings.length;
      const overData = over.data.current;
      if (overData?.type === "card") {
        const idx = siblings.findIndex((c) => c.id === over.id);
        if (idx !== -1) {
          const side = resolveDropSide(active.rect.current.translated, over.rect, "vertical");
          insertIndex = side === "after" ? idx + 1 : idx;
        }
      }

      const before = siblings[insertIndex - 1] ?? null;
      const after = siblings[insertIndex] ?? null;

      // Optimistically drop the card into its final spot immediately, instead of
      // waiting for the Firestore round-trip — otherwise it snaps back to its old
      // position for a moment and then jumps once the listener fires.
      const previousCards = cards;
      const reorderedTargetColumn = [...siblings];
      reorderedTargetColumn.splice(insertIndex, 0, liveCard);
      setCards((prev) => {
        const otherCards = prev.filter(
          (c) => c.id !== activeCardId && c.columnId !== targetColumnId
        );
        return [...otherCards, ...reorderedTargetColumn];
      });

      try {
        await moveCard(boardId, activeCardId, targetColumnId, before?.id ?? null, after?.id ?? null);
      } catch (err) {
        console.error("Failed to move card, reverting:", err);
        setCards(previousCards);
      }
    }
  };

  if (isLoading) {
    return <BoardSkeleton />;
  }

  if (!board) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="flex flex-1 items-center justify-center text-sm text-[#49454f]">
          Board not found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar boardName={board.name} />

      <div className="px-8 pb-2 pt-8">
        {editingBoardName ? (
          <input
            autoFocus
            value={boardNameDraft}
            onChange={(e) => setBoardNameDraft(e.target.value)}
            onBlur={commitRenameBoard}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRenameBoard();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingBoardName(false);
              }
            }}
            className="w-full rounded-2xl border-2 border-[#6750a4] bg-white px-3 py-1 text-3xl font-normal tracking-tight text-[#1c1b1f] outline-none"
          />
        ) : (
          <h1
            onClick={startRenameBoard}
            className="cursor-pointer rounded-2xl px-3 py-1 text-3xl font-normal tracking-tight text-[#1c1b1f] transition-colors hover:bg-[#e7e0ec]"
          >
            {board.name}
          </h1>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="custom-scrollbar flex flex-1 gap-6 overflow-x-auto p-8">
          <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            {columns.map((column) => (
              <SortableColumn
                key={column.id}
                boardId={boardId}
                column={column}
                cards={cards.filter((c) => c.columnId === column.id)}
                onSelectCard={setSelectedCard}
              />
            ))}
          </SortableContext>

          {pendingColumns
            .filter((column) => !columns.some((real) => real.id === column.id))
            .map((column) => (
              <div
                key={column.id}
                className="flex h-fit w-72 flex-none flex-col rounded-[24px] bg-[#f3edf7] p-4 opacity-50 shadow-sm"
              >
                <div className="px-2 py-2 text-sm font-bold uppercase tracking-wide text-[#49454f]">
                  {column.name}
                </div>
              </div>
            ))}

          <div className="w-72 flex-none">
            {addingColumn ? (
              <form onSubmit={handleAddColumn} className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelAddColumn();
                    }
                  }}
                  placeholder="Column name"
                  className="w-full rounded-2xl border-2 border-[#cac4d0] bg-white px-4 py-3 text-sm text-[#1c1b1f] outline-none focus:border-[#6750a4]"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!newColumnName.trim()}
                    className="rounded-full bg-[#6750a4] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#5d4794] disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={cancelAddColumn}
                    className="rounded-full px-4 py-2 text-sm font-medium text-[#49454f] transition-colors hover:bg-black/5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-[#cac4d0] px-4 py-4 text-sm font-medium text-[#49454f] transition-all hover:border-[#6750a4] hover:bg-[#6750a4]/5"
              >
                <span className="text-lg leading-none">+</span>
                Add column
              </button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="w-72 rounded-[16px] bg-[#e7e0ec] px-4 py-4 text-left text-sm font-medium text-[#1c1b1f] shadow-lg">
              {activeCard.title}
            </div>
          )}
          {activeColumn && (
            <div className="w-72 rounded-[24px] bg-[#f3edf7] p-4 text-sm font-bold uppercase tracking-wide text-[#49454f] shadow-lg">
              {activeColumn.name}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selectedCard && (
        <CardDetailModal
          key={selectedCard.id}
          boardId={boardId}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}

function SortableColumn({
  boardId,
  column,
  cards,
  onSelectCard,
}: {
  boardId: string;
  column: Column;
  cards: Card[];
  onSelectCard: (card: Card) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: column.id, data: { type: "column" } });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `dropzone-${column.id}`,
    data: { type: "column-dropzone", columnId: column.id },
  });

  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingCards, setPendingCards] = useState<Card[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);

  const startRenameColumn = () => {
    setNameDraft(column.name);
    setEditingName(true);
  };

  const commitRenameColumn = async () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === column.name) return;
    try {
      await renameColumn(boardId, column.id, trimmed);
    } catch (err) {
      console.error("Failed to rename column:", err);
    }
  };

  const handleAddCard = async (e: FormEvent) => {
    e.preventDefault();
    const title = newCardTitle.trim();
    if (!title) return;
    setNewCardTitle("");
    setAddingCard(false);

    const id = generateCardId(boardId);
    setPendingCards((prev) => [
      ...prev,
      {
        id,
        columnId: column.id,
        title,
        description: "",
        position: "~",
        createdAt: null,
        updatedAt: null,
      },
    ]);

    try {
      await createCard(boardId, column.id, title, id);
    } catch (err) {
      console.error("Failed to create card:", err);
    } finally {
      setPendingCards((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const cancelAddCard = () => {
    setNewCardTitle("");
    setAddingCard(false);
  };

  const handleConfirmDeleteColumn = async () => {
    await deleteColumn(boardId, column.id);
    setConfirmingDelete(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex h-fit w-72 flex-none flex-col rounded-[24px] bg-[#f3edf7] p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className={`flex items-center justify-between px-2 py-2 text-sm font-bold uppercase tracking-wide text-[#49454f] ${
          editingName ? "" : "cursor-grab active:cursor-grabbing"
        }`}
        {...(editingName ? {} : attributes)}
        {...(editingName ? {} : listeners)}
      >
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRenameColumn}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRenameColumn();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingName(false);
              }
            }}
            className="w-full rounded-lg border-2 border-[#6750a4] bg-white px-2 py-0.5 text-sm font-bold normal-case tracking-normal text-[#1c1b1f] outline-none"
          />
        ) : (
          <span
            onClick={startRenameColumn}
            className="cursor-text truncate rounded-lg px-1 hover:bg-black/5"
          >
            {column.name}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-[#e7e0ec] px-2 py-0.5 text-xs">
            {cards.length +
              pendingCards.filter((c) => !cards.some((real) => real.id === c.id)).length}
          </span>
          <OverflowMenu
            ariaLabel={`Options for ${column.name}`}
            items={[
              {
                label: "Delete",
                destructive: true,
                onClick: () => setConfirmingDelete(true),
              },
            ]}
          />
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${column.name}"?`}
          message="This deletes all its cards too. This can't be undone."
          onConfirm={handleConfirmDeleteColumn}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setDropRef} className="flex min-h-[8px] flex-col gap-3 py-3">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onSelect={() => onSelectCard(card)} />
          ))}
          {pendingCards
            .filter((card) => !cards.some((real) => real.id === card.id))
            .map((card) => (
              <div
                key={card.id}
                className="rounded-[16px] bg-[#e7e0ec] px-4 py-4 text-left text-sm font-medium text-[#1c1b1f] opacity-50 shadow-sm"
              >
                {card.title}
              </div>
            ))}
        </div>
      </SortableContext>

      {addingCard ? (
        <form onSubmit={handleAddCard} className="flex flex-col gap-2 pt-1">
          <input
            autoFocus
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancelAddCard();
              }
            }}
            placeholder="Card title"
            className="w-full rounded-2xl border-2 border-[#cac4d0] bg-white px-4 py-2 text-sm text-[#1c1b1f] outline-none focus:border-[#6750a4]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newCardTitle.trim()}
              className="rounded-full bg-[#6750a4] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#5d4794] disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={cancelAddCard}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#49454f] transition-colors hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCard(true)}
          className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-medium text-[#6750a4] transition-colors hover:bg-[#6750a4]/10"
        >
          <span className="text-lg leading-none">+</span>
          Add a card
        </button>
      )}
    </div>
  );
}

function SortableCard({ card, onSelect }: { card: Card; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: "card", columnId: card.columnId } });

  return (
    <button
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      type="button"
      onClick={onSelect}
      className="cursor-grab rounded-[16px] bg-[#e7e0ec] px-4 py-4 text-left text-sm font-medium text-[#1c1b1f] shadow-sm transition-all hover:scale-[1.02] hover:shadow-md active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      {card.title}
    </button>
  );
}
