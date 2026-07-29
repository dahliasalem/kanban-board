"use client";

import { useState, type KeyboardEvent } from "react";
import { deleteCard, updateCard, type Card } from "@/lib/boards";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function CardDetailModal({
  boardId,
  card,
  onClose,
}: {
  boardId: string;
  card: Card;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSave = () => {
    if (!title.trim()) return;
    updateCard(boardId, card.id, {
      title: title.trim(),
      description,
    });
    onClose();
  };

  const handleConfirmDelete = async () => {
    await deleteCard(boardId, card.id);
    onClose();
  };

  const handleModalKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleTitleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <>
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
      onClick={onClose}
      onKeyDown={handleModalKeyDown}
    >
      <div
        className="w-full max-w-md rounded-[28px] bg-[#f3edf7] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-[#49454f]">
            Card
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#49454f] transition-colors hover:bg-[#e7e0ec] active:bg-[#d1c4e9]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <label
              htmlFor="card-title-input"
              className="mb-1 block px-1 text-xs font-medium uppercase tracking-wide text-[#49454f]"
            >
              Title
            </label>
            <input
              id="card-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="w-full rounded-2xl border-2 border-[#cac4d0] bg-white px-4 py-2.5 text-lg font-normal text-[#1c1b1f] outline-none focus:border-[#6750a4]"
            />
          </div>

          <div>
            <label
              htmlFor="card-desc-input"
              className="mb-1 block px-1 text-xs font-medium uppercase tracking-wide text-[#49454f]"
            >
              Description
            </label>
            <textarea
              id="card-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-2xl border-2 border-[#cac4d0] bg-white px-4 py-2.5 text-sm font-normal leading-relaxed text-[#1c1b1f] outline-none focus:border-[#6750a4]"
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-600/10"
          >
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-6 py-2 text-sm font-medium text-[#6750a4] transition-colors hover:bg-[#6750a4]/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!title.trim()}
              className="rounded-full bg-[#6750a4] px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>

    {confirmingDelete && (
      <ConfirmDialog
        title={`Delete "${card.title}"?`}
        message="This can't be undone."
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    )}
    </>
  );
}
