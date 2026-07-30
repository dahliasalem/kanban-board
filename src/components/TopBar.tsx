"use client";

import { useAuth } from "@/lib/auth-context";
import { BoardDropdown } from "@/components/BoardDropdown";

export function TopBar({ boardName }: { boardName?: string }) {
  const { signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 flex-none items-center justify-between border-b border-[#e7e0ec] bg-[#fffbfe] px-4 shadow-sm md:px-8">
      <div className="flex items-center gap-2 text-sm text-[#49454f]">
        <span>Boards</span>
        {boardName && (
          <>
            <svg
              className="h-3 w-3 text-[#cac4d0]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                d="M9 6l6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-bold text-[#1c1b1f]">{boardName}</span>
          </>
        )}
      </div>

      <BoardDropdown className="md:hidden" />

      <button
        type="button"
        onClick={() => signOut()}
        className="hidden rounded-full border border-[#cac4d0] bg-[#fffbfe] px-6 py-2 text-sm font-medium text-[#49454f] transition-all hover:bg-[#f3edf7] active:scale-95 md:inline-flex"
      >
        Sign out
      </button>
    </header>
  );
}
