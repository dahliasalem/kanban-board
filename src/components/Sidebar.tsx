"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { setBoardCacheEntry } from "@/lib/board-cache";
import {
  createBoard,
  deleteBoard,
  generateBoardId,
  renameBoard,
  reorderBoard,
  subscribeToBoards,
  type Board,
} from "@/lib/boards";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OverflowMenu } from "@/components/OverflowMenu";

type Rect = { top: number; left: number; width: number; height: number } | null;

// Determines whether a drop should insert before or after the target, based on
// which half of the target the dragged item's center landed in — without this,
// dropping "on" an item always inserts before it, making the end unreachable.
function resolveDropSide(activeRect: Rect, overRect: Rect): "before" | "after" {
  if (!activeRect || !overRect) return "before";
  const activeCenterY = activeRect.top + activeRect.height / 2;
  const overCenterY = overRect.top + overRect.height / 2;
  return activeCenterY > overCenterY ? "after" : "before";
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 4v16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Below this distance a pointerdown->pointerup is treated as a click rather
// than a drag — kept in sync with the DndContext's PointerSensor activation
// distance so the two never disagree about which gesture is happening.
const CLICK_DRAG_THRESHOLD = 8;

function SortableBoardRow({
  board,
  active,
  onDelete,
  onNavigate,
  onRename,
}: {
  board: Board;
  active: boolean;
  onDelete: () => void;
  onNavigate: () => void;
  onRename: (name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: board.id });
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(board.name);

  const startRename = () => {
    setDraft(board.name);
    setRenaming(true);
  };

  const commitRename = () => {
    setRenaming(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== board.name) {
      onRename(trimmed);
    }
  };

  // A plain div instead of an <a>/next/link — anchors are natively draggable
  // in Chromium at the renderer level regardless of the draggable="false"
  // attribute or dnd-kit's synthetic pointer handling, so dragging one to
  // reorder could still trigger the browser's built-in link-drag fallback,
  // which on drop performs a full navigation (reload) to its own href.
  //
  // Navigation is decided by measuring actual pointer movement between
  // down and up, rather than relying on a native "click" event (which may
  // or may not fire depending on whether dnd-kit's transform happens to
  // leave the same DOM element under the pointer at drop time) or on
  // coordinating a shared "was this a drag" flag with the parent's
  // drag-end handler — both proved fragile in practice.
  const dndOnPointerDown = listeners?.onPointerDown as
    | ((e: ReactPointerEvent<HTMLDivElement>) => void)
    | undefined;

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    dndOnPointerDown?.(e);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerDownPos.current;
    pointerDownPos.current = null;
    if (!start) return;
    const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (distance < CLICK_DRAG_THRESHOLD) {
      onNavigate();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={`flex items-center rounded-full pr-1.5 transition-colors ${
        active ? "bg-[#e8def8]" : "hover:bg-[#e7e0ec]"
      }`}
    >
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setRenaming(false);
            }
          }}
          className="flex-1 truncate rounded-full border-2 border-[#6750a4] bg-white px-4 py-1.5 text-sm font-medium text-[#1c1b1f] outline-none"
        />
      ) : (
        <div
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onNavigate();
            }
          }}
          className={`flex-1 cursor-pointer truncate px-4 py-3 text-sm font-medium outline-none ${
            active ? "text-[#1d192b]" : "text-[#49454f]"
          }`}
          {...attributes}
          {...listeners}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          role="link"
        >
          {board.name}
        </div>
      )}
      <OverflowMenu
        ariaLabel={`Options for ${board.name}`}
        items={[
          { label: "Rename", onClick: startRename },
          { label: "Delete", destructive: true, onClick: onDelete },
        ]}
      />
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [boards, setBoards] = useState<Board[]>([]);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [boardPendingDelete, setBoardPendingDelete] = useState<Board | null>(null);
  const [pendingBoards, setPendingBoards] = useState<Board[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (!user) return;
    return subscribeToBoards(user.uid, setBoards);
  }, [user]);

  const handleCreateBoard = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = newBoardName.trim();
    if (!name) return;
    setNewBoardName("");
    setCreating(false);

    const id = generateBoardId();
    const newBoard: Board = {
      id,
      name,
      ownerId: user.uid,
      memberIds: [user.uid],
      position: "~",
      createdAt: null,
    };
    setPendingBoards((prev) => [...prev, newBoard]);

    try {
      await createBoard(user.uid, name, id);
      // A board we just created has no columns or cards yet, and we already
      // know its name — seed the cache so the board page's first render
      // (right after this navigation) skips the skeleton entirely instead
      // of waiting on listeners to confirm what we already know is true.
      setBoardCacheEntry(id, { board: newBoard, columns: [], cards: [] });
      router.push(`/boards/${id}`);
    } catch (err) {
      console.error("Failed to create board:", err);
    } finally {
      setPendingBoards((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const cancelCreateBoard = () => {
    setNewBoardName("");
    setCreating(false);
  };

  const handleConfirmDeleteBoard = async () => {
    if (!boardPendingDelete) return;
    const wasViewingDeletedBoard = pathname === `/boards/${boardPendingDelete.id}`;
    await deleteBoard(boardPendingDelete.id);
    setBoardPendingDelete(null);
    if (wasViewingDeletedBoard) {
      router.push("/");
    }
  };

  const handleRenameBoard = async (boardId: string, name: string) => {
    const previousBoards = boards;
    setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name } : b)));
    try {
      await renameBoard(boardId, name);
    } catch (err) {
      console.error("Failed to rename board, reverting:", err);
      setBoards(previousBoards);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeBoard = boards.find((b) => b.id === active.id);
    if (!activeBoard) return;
    const withoutActive = boards.filter((b) => b.id !== active.id);
    const overIndex = withoutActive.findIndex((b) => b.id === over.id);
    if (overIndex === -1) return;

    const side = resolveDropSide(active.rect.current.translated, over.rect);
    const insertIndex = side === "after" ? overIndex + 1 : overIndex;

    const previousBoards = boards;
    const reordered = [...withoutActive];
    reordered.splice(insertIndex, 0, activeBoard);
    setBoards(reordered);

    const beforeBoard = reordered[insertIndex - 1] ?? null;
    const afterBoard = reordered[insertIndex + 1] ?? null;
    try {
      await reorderBoard(active.id as string, beforeBoard?.id ?? null, afterBoard?.id ?? null);
    } catch (err) {
      console.error("Failed to reorder board, reverting:", err);
      setBoards(previousBoards);
    }
  };

  return (
    <aside
      className={`flex flex-none flex-col overflow-hidden bg-[#f3edf7] transition-[width] duration-300 ease-in-out ${
        collapsed ? "w-16" : "w-72"
      }`}
    >
      <div className="flex h-[88px] flex-none items-center px-4">
        <span
          className={`flex-1 overflow-hidden whitespace-nowrap text-4xl font-bold tracking-tight text-[#1c1b1f] transition-opacity duration-200 ${
            collapsed ? "opacity-0" : "opacity-100"
          }`}
        >
          Kanban
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[#49454f] transition-colors hover:bg-[#e7e0ec]"
        >
          <PanelIcon />
        </button>
      </div>

      <div
        className={`flex min-w-[256px] flex-1 flex-col p-4 pt-0 transition-opacity duration-200 ${
          collapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="mb-4 mt-4 px-4 text-xs font-bold uppercase tracking-widest text-[#49454f]">
          Your boards
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={boards.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <nav className="flex flex-col gap-1">
              {boards.map((board) => (
                <SortableBoardRow
                  key={board.id}
                  board={board}
                  active={pathname === `/boards/${board.id}`}
                  onDelete={() => setBoardPendingDelete(board)}
                  onNavigate={() => router.push(`/boards/${board.id}`)}
                  onRename={(name) => handleRenameBoard(board.id, name)}
                />
              ))}
              {pendingBoards
                .filter((board) => !boards.some((real) => real.id === board.id))
                .map((board) => (
                  <div
                    key={board.id}
                    className="truncate rounded-full px-4 py-3 text-sm font-medium text-[#49454f] opacity-50"
                  >
                    {board.name}
                  </div>
                ))}
              {boards.length === 0 && pendingBoards.length === 0 && !creating && (
                <p className="px-4 py-3 text-sm text-[#49454f]">No boards yet</p>
              )}
            </nav>
          </SortableContext>
        </DndContext>

        <div className="mt-6 px-2">
          {creating ? (
            <form onSubmit={handleCreateBoard}>
              <input
                autoFocus
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onBlur={() => {
                  if (!newBoardName.trim()) setCreating(false);
                }}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelCreateBoard();
                  }
                }}
                placeholder="Board name"
                className="w-full rounded-full border-2 border-[#cac4d0] bg-white px-4 py-3 text-sm text-[#1c1b1f] outline-none focus:border-[#6750a4]"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-full bg-[#e8def8] px-4 py-4 text-sm font-semibold text-[#1d192b] shadow-sm transition-all hover:bg-[#ded2f0] hover:shadow-md active:scale-95"
            >
              <span className="text-lg leading-none">+</span>
              Create new board
            </button>
          )}
        </div>
      </div>

      {boardPendingDelete && (
        <ConfirmDialog
          title={`Delete "${boardPendingDelete.name}"?`}
          message="This deletes all its columns and cards too. This can't be undone."
          onConfirm={handleConfirmDeleteBoard}
          onCancel={() => setBoardPendingDelete(null)}
        />
      )}
    </aside>
  );
}
