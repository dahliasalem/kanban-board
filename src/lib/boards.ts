import { generateKeyBetween } from "fractional-indexing";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// A board/column/card listener can still be attached for a brief moment
// after its board is deleted (the board page unsubscribes on unmount, which
// only happens once React processes the resulting navigation) — the rules
// then reject the now-gone document as permission-denied. That's an
// expected race, not a real problem, so it's swallowed here; anything else
// still surfaces since it could point to a real rules or connectivity bug.
function ignoreExpectedSnapshotError(error: FirestoreError): void {
  if (error.code !== "permission-denied") {
    console.error("Firestore snapshot listener error:", error);
  }
}

// Generates a Firestore document id ahead of the actual write (no network
// call — doc() with no id just allocates one client-side). Letting callers
// use this same id for an optimistic local placeholder means the eventual
// real-time update carries an identical id, so the placeholder can be
// dropped by exact id match instead of racing the create() promise.
export function generateBoardId(): string {
  return doc(collection(db, "boards")).id;
}

export function generateColumnId(boardId: string): string {
  return doc(collection(db, "boards", boardId, "columns")).id;
}

export function generateCardId(boardId: string): string {
  return doc(collection(db, "boards", boardId, "cards")).id;
}

export type Board = {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  position: string;
  createdAt: Timestamp | null;
};

export type Column = {
  id: string;
  name: string;
  position: string;
};

export type Card = {
  id: string;
  columnId: string;
  title: string;
  description: string;
  position: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export async function createBoard(
  uid: string,
  name: string,
  id: string = generateBoardId()
): Promise<string> {
  const boardsRef = collection(db, "boards");
  const lastSnapshot = await getDocs(
    query(
      boardsRef,
      where("memberIds", "array-contains", uid),
      orderBy("position", "desc"),
      limit(1)
    )
  );
  const lastPosition = (lastSnapshot.docs[0]?.data().position as string) ?? null;
  const position = generateKeyBetween(lastPosition, null);

  await setDoc(doc(boardsRef, id), {
    name,
    ownerId: uid,
    memberIds: [uid],
    position,
    createdAt: serverTimestamp(),
  });
  return id;
}

export function subscribeToBoards(
  uid: string,
  callback: (boards: Board[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "boards"),
    where("memberIds", "array-contains", uid),
    orderBy("position")
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Board)
    );
  });
}

export async function createColumn(
  boardId: string,
  name: string,
  id: string = generateColumnId(boardId)
): Promise<string> {
  const columnsRef = collection(db, "boards", boardId, "columns");
  const lastSnapshot = await getDocs(
    query(columnsRef, orderBy("position", "desc"), limit(1))
  );
  const lastPosition = (lastSnapshot.docs[0]?.data().position as string) ?? null;
  const position = generateKeyBetween(lastPosition, null);

  await setDoc(doc(columnsRef, id), { name, position });
  return id;
}

export function subscribeToColumns(
  boardId: string,
  callback: (columns: Column[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "boards", boardId, "columns"),
    orderBy("position")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Column)
      );
    },
    ignoreExpectedSnapshotError
  );
}

export async function createCard(
  boardId: string,
  columnId: string,
  title: string,
  id: string = generateCardId(boardId)
): Promise<string> {
  const cardsRef = collection(db, "boards", boardId, "cards");
  const lastSnapshot = await getDocs(
    query(
      cardsRef,
      where("columnId", "==", columnId),
      orderBy("position", "desc"),
      limit(1)
    )
  );
  const lastPosition = (lastSnapshot.docs[0]?.data().position as string) ?? null;
  const position = generateKeyBetween(lastPosition, null);
  const now = serverTimestamp();

  await setDoc(doc(cardsRef, id), {
    columnId,
    title,
    description: "",
    position,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export function subscribeToCards(
  boardId: string,
  callback: (cards: Card[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "boards", boardId, "cards"),
    orderBy("position")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Card));
    },
    ignoreExpectedSnapshotError
  );
}

export async function updateCard(
  boardId: string,
  cardId: string,
  data: { title?: string; description?: string }
): Promise<void> {
  await updateDoc(doc(db, "boards", boardId, "cards", cardId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToBoard(
  boardId: string,
  callback: (board: Board | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "boards", boardId),
    (snapshot) => {
      callback(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Board) : null);
    },
    ignoreExpectedSnapshotError
  );
}

export async function renameBoard(boardId: string, name: string): Promise<void> {
  await updateDoc(doc(db, "boards", boardId), { name });
}

export async function renameColumn(
  boardId: string,
  columnId: string,
  name: string
): Promise<void> {
  await updateDoc(doc(db, "boards", boardId, "columns", columnId), { name });
}

export async function deleteCard(boardId: string, cardId: string): Promise<void> {
  await deleteDoc(doc(db, "boards", boardId, "cards", cardId));
}

export async function deleteColumn(
  boardId: string,
  columnId: string
): Promise<void> {
  const cardsSnap = await getDocs(
    query(
      collection(db, "boards", boardId, "cards"),
      where("columnId", "==", columnId)
    )
  );

  const batch = writeBatch(db);
  cardsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "boards", boardId, "columns", columnId));
  await batch.commit();
}

export async function deleteBoard(boardId: string): Promise<void> {
  const [columnsSnap, cardsSnap] = await Promise.all([
    getDocs(collection(db, "boards", boardId, "columns")),
    getDocs(collection(db, "boards", boardId, "cards")),
  ]);

  const batch = writeBatch(db);
  columnsSnap.docs.forEach((d) => batch.delete(d.ref));
  cardsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "boards", boardId));
  await batch.commit();
}

export async function reorderBoard(
  boardId: string,
  beforeBoardId: string | null,
  afterBoardId: string | null
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const beforePosition = beforeBoardId
      ? ((await transaction.get(doc(db, "boards", beforeBoardId))).data()
          ?.position as string | undefined) ?? null
      : null;
    const afterPosition = afterBoardId
      ? ((await transaction.get(doc(db, "boards", afterBoardId))).data()
          ?.position as string | undefined) ?? null
      : null;
    const position = generateKeyBetween(beforePosition, afterPosition);
    transaction.update(doc(db, "boards", boardId), { position });
  });
}

export async function reorderColumn(
  boardId: string,
  columnId: string,
  beforeColumnId: string | null,
  afterColumnId: string | null
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const beforePosition = beforeColumnId
      ? ((
          await transaction.get(doc(db, "boards", boardId, "columns", beforeColumnId))
        ).data()?.position as string | undefined) ?? null
      : null;
    const afterPosition = afterColumnId
      ? ((
          await transaction.get(doc(db, "boards", boardId, "columns", afterColumnId))
        ).data()?.position as string | undefined) ?? null
      : null;
    const position = generateKeyBetween(beforePosition, afterPosition);
    transaction.update(doc(db, "boards", boardId, "columns", columnId), {
      position,
    });
  });
}

export async function moveCard(
  boardId: string,
  cardId: string,
  newColumnId: string,
  beforeCardId: string | null,
  afterCardId: string | null
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const beforePosition = beforeCardId
      ? ((
          await transaction.get(doc(db, "boards", boardId, "cards", beforeCardId))
        ).data()?.position as string | undefined) ?? null
      : null;
    const afterPosition = afterCardId
      ? ((
          await transaction.get(doc(db, "boards", boardId, "cards", afterCardId))
        ).data()?.position as string | undefined) ?? null
      : null;
    const position = generateKeyBetween(beforePosition, afterPosition);
    transaction.update(doc(db, "boards", boardId, "cards", cardId), {
      columnId: newColumnId,
      position,
      updatedAt: serverTimestamp(),
    });
  });
}
