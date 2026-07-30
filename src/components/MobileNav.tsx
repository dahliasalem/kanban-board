"use client";

import { useAuth } from "@/lib/auth-context";

export function MobileNav() {
  const { signOut } = useAuth();

  return (
    <div className="flex flex-none items-center justify-between border-b border-[#e7e0ec] bg-[#f3edf7] px-4 py-3 md:hidden">
      <span className="text-2xl font-bold tracking-tight text-[#1c1b1f]">Kanban</span>
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-full border border-[#cac4d0] bg-[#fffbfe] px-4 py-2 text-sm font-medium text-[#49454f] transition-all hover:bg-[#f3edf7] active:scale-95"
      >
        Sign out
      </button>
    </div>
  );
}
