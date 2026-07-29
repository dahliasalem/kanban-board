"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useAuth } from "@/lib/auth-context";
import { subscribeToBoards, type Board } from "@/lib/boards";

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  // null = boards not loaded yet, distinct from "loaded and empty" — used to
  // hold off rendering anything until we actually know whether to redirect.
  const [boards, setBoards] = useState<Board[] | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToBoards(user.uid, setBoards);
  }, [user]);

  useEffect(() => {
    if (boards && boards.length > 0) {
      router.replace(`/boards/${boards[0].id}`);
    }
  }, [boards, router]);

  if (!boards || boards.length > 0) {
    // Still loading, or a redirect to the first board is about to happen —
    // render nothing rather than flashing the empty state first.
    return null;
  }

  return (
    <>
      <TopBar />
      <div className="flex flex-1 items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-lg font-semibold text-[#1c1b1f]">
            Create your first board
          </h1>
          <p className="mt-1 text-sm text-[#49454f]">
            Use the sidebar to get started.
          </p>
        </div>
      </div>
    </>
  );
}
