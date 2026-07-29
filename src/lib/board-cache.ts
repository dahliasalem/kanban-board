import type { Board, Card, Column } from "@/lib/boards";

// Module-level, so it survives BoardPageContent remounting on every board
// switch: once a board has been loaded (or is known up front, e.g. one this
// user just created) its last known data lives here, letting a mount seed
// its state synchronously instead of showing a skeleton while the
// (necessarily async) Firestore listeners catch up.
export type BoardCacheEntry = {
  board: Board | null;
  columns: Column[];
  cards: Card[];
};

const boardCache = new Map<string, BoardCacheEntry>();

export function getBoardCacheEntry(boardId: string): BoardCacheEntry | undefined {
  return boardCache.get(boardId);
}

export function setBoardCacheEntry(
  boardId: string,
  entry: Partial<BoardCacheEntry>
): void {
  const existing = boardCache.get(boardId) ?? { board: null, columns: [], cards: [] };
  boardCache.set(boardId, { ...existing, ...entry });
}
