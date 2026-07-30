"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { setBoardCacheEntry } from "@/lib/board-cache";
import {
  createBoard,
  generateBoardId,
  subscribeToBoards,
  type Board,
} from "@/lib/boards";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 flex-none transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BoardDropdown({ className }: { className?: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [boards, setBoards] = useState<Board[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToBoards(user.uid, setBoards);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeBoard = boards.find((b) => pathname === `/boards/${b.id}`);

  const handleCreateBoard = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = newBoardName.trim();
    if (!name) return;
    setNewBoardName("");
    setCreating(false);
    setOpen(false);

    const id = generateBoardId();
    try {
      await createBoard(user.uid, name, id);
      // Same skip-the-skeleton seeding used on desktop create.
      setBoardCacheEntry(id, {
        board: {
          id,
          name,
          ownerId: user.uid,
          memberIds: [user.uid],
          position: "~",
          createdAt: null,
        },
        columns: [],
        cards: [],
      });
      router.push(`/boards/${id}`);
    } catch (err) {
      console.error("Failed to create board:", err);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex max-w-[60vw] items-center gap-1.5 rounded-full bg-[#e8def8] px-4 py-2 text-sm font-medium text-[#1d192b]"
      >
        <span className="truncate">{activeBoard ? activeBoard.name : "Boards"}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-72 max-w-[90vw] overflow-y-auto rounded-2xl bg-white py-2 shadow-lg ring-1 ring-black/5">
          {boards.map((board) => {
            const active = pathname === `/boards/${board.id}`;
            return (
              <button
                key={board.id}
                type="button"
                onClick={() => {
                  router.push(`/boards/${board.id}`);
                  setOpen(false);
                }}
                className={`block w-full truncate px-4 py-3 text-left text-sm font-medium ${
                  active ? "bg-[#e8def8] text-[#1d192b]" : "text-[#49454f] hover:bg-[#f3edf7]"
                }`}
              >
                {board.name}
              </button>
            );
          })}
          {boards.length === 0 && !creating && (
            <p className="px-4 py-3 text-sm text-[#49454f]">No boards yet</p>
          )}

          <div className="mt-1 border-t border-[#e7e0ec] px-2 pt-2">
            {creating ? (
              <form onSubmit={handleCreateBoard}>
                <input
                  autoFocus
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  onBlur={() => {
                    if (!newBoardName.trim()) setCreating(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setNewBoardName("");
                      setCreating(false);
                    }
                  }}
                  placeholder="Board name"
                  className="w-full rounded-full border-2 border-[#cac4d0] bg-white px-4 py-2.5 text-sm text-[#1c1b1f] outline-none focus:border-[#6750a4]"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-[#6750a4] hover:bg-[#f3edf7]"
              >
                <span className="text-lg leading-none">+</span>
                Create new board
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
