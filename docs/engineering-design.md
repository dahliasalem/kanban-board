# Engineering Design Doc: Collaborative Kanban Board

*Implementation-level companion to `kanban-prd.md`. Pairs with the architecture, user-flow, and UI-wireframe diagram artifacts.*

## 1. Purpose & scope

Describes how the system is actually built: data schema, concurrency mechanics, the event-driven backend, external integrations, security, and secrets. The PRD covers *what* and *why*; this doc covers *how*.

## 2. Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind.
- **Data:** Firestore — NoSQL document database.
- **Backend logic:** Firebase Cloud Functions (event-triggered) for background work; Next.js API routes (request/response) for proxying third-party calls that need a secret key.
- **Auth:** Firebase Authentication.
- **External services:** Unsplash API (backgrounds), a transactional email API (invites — Resend/SendGrid/Postmark, TBD).

## 3. Data model (Firestore schema)

Collections and cards are nested under their board (`boards/{boardId}/...`) rather than kept top-level with a `boardId` field. **Why:** every query in the MVP is already scoped to one board at a time — nesting means a single membership check at the board level secures the whole subtree via Firestore's rules inheritance, instead of repeating an equality filter on `boardId` in every rule.

```ts
// boards/{boardId}
interface Board {
  name: string;
  ownerId: string;
  memberIds: string[];       // used directly by security rules
  background?: {
    url: string;
    photographerName: string;
    photographerUrl: string;
    unsplashId: string;
  };
  createdAt: Timestamp;
}

// boards/{boardId}/columns/{columnId}
interface Column {
  name: string;
  position: string;          // fractional-index rank string
}

// boards/{boardId}/cards/{cardId}
interface Card {
  columnId: string;
  title: string;
  description: string;
  position: string;          // fractional-index rank string
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// boards/{boardId}/cards/{cardId}/versions/{versionId}
interface CardVersion {
  field: string;
  oldValue: string;
  newValue: string;
  editedBy: string;          // uid
  editedAt: Timestamp;
}

// boards/{boardId}/activityFeed/{entryId}
interface ActivityEntry {
  message: string;           // pre-formatted, readable line
  createdAt: Timestamp;
  relatedCardId?: string;
}

// boards/{boardId}/invites/{inviteId}
interface Invite {
  email: string;
  status: "pending" | "accepted" | "expired";
  invitedBy: string;         // uid
  createdAt: Timestamp;
}

// users/{uid}  — top-level; identity spans boards
interface UserProfile {
  displayName: string;
  email: string;
  avatarUrl?: string;
}
```

## 4. Security rules (approach)

All board-scoped collections check membership against the parent board's `memberIds`:

```
match /boards/{boardId} {
  allow read, write: if request.auth.uid in resource.data.memberIds;

  match /{subcollection=**} {
    allow read, write: if request.auth.uid in get(/databases/$(database)/documents/boards/$(boardId)).data.memberIds;
  }
}
```

`users/{uid}` is readable by any authenticated user (needed for the invite Cloud Function's email lookup) but writable only by its own owner.

## 5. Concurrency design

**Card move (drag-and-drop):** wrapped in a Firestore transaction. Reads the two neighboring cards' `position` values, computes a new rank between them via the `fractional-indexing` library (`generateKeyBetween`), then writes the moved card's `columnId` + `position` and appends a `CardVersion` — all in one transaction. If either neighbor changed since being read, Firestore aborts the transaction and the SDK retries the callback automatically against fresh data. This is optimistic concurrency, not last-write-wins: a losing write re-runs its logic against current state rather than silently overwriting or being silently overwritten.

**Version restore** (planned enhancement): guarded the same way — a version-number check ensures a restore can't clobber a concurrent edit made after the version list was loaded.

## 6. Derived state & event-driven backend

Every card mutation (title, description, column/position) appends an immutable entry to `versions` in the same transaction as the field update. Current state (the card's own fields) stays plain CRUD for fast reads; history is derived from the version log — not the other way around.

A Firestore-triggered Cloud Function (`onDocumentCreated` on `boards/{boardId}/cards/{cardId}/versions/{versionId}`) fires once per new version, formats it into a readable line, and writes it to `boards/{boardId}/activityFeed`. The client never computes this formatting — it just listens to `activityFeed` in real time. This is a materialized projection, not a query-time computation: reads stay cheap and instant regardless of how much history exists.

## 7. Real-time sync

The client subscribes to `boards/{boardId}/cards` via `onSnapshot`, ordered by `position` (`orderBy("position")`). Combining an equality filter (`where("columnId", "==", ...)`, if queried per-column) with `orderBy` on a different field requires a Firestore composite index — provisioned ahead of time, not automatic. During a drag, the UI applies the move optimistically before the transaction resolves, then reconciles with the confirmed write (`snapshot.metadata.hasPendingWrites`).

## 8. External integrations

### 8.1 Invite emails
Cloud Function triggered on `boards/{boardId}/invites/{inviteId}` creation. Looks up the invited email against `users` (or Firebase Auth's `getUserByEmail`) to pick a template — "join the board" for a new user, "shared with you" for an existing one — then calls the email API. The provider's API key lives in Cloud Functions config/secrets, never in client code.

### 8.2 Unsplash background search
A Next.js API route (`/api/unsplash/search`) proxies the search request, holding `UNSPLASH_ACCESS_KEY` as a server-side env var so it never reaches the browser. This is a plain request/response route, not a Cloud Function — there's no event to trigger off, just a user typing a query. On selection, the client writes the chosen photo's metadata directly to the board doc (plain CRUD), and the UI renders the required photographer attribution; selection also pings Unsplash's download-tracking endpoint per their API terms.

## 9. Auth

Firebase Authentication handles identity (email/password to start). A `users/{uid}` Firestore doc holds app-specific profile data Auth doesn't store (display name, avatar), created on first sign-in. Firebase's client config (including its `apiKey`) is not treated as a secret — it's safe to ship in the client bundle because access is enforced by security rules, not by hiding the config.

## 10. Environment & secrets

- **Local (`.env.local`, gitignored):** `UNSPLASH_ACCESS_KEY`, email provider API key, Firebase client config (not secret, but kept in env for per-environment flexibility).
- **Production:** Cloud Functions secrets/config for the email API key; hosting platform env vars (Vercel/Firebase Hosting) for the Unsplash key used by the Next.js API route.
- Rule of thumb applied throughout: a key is server-side-only if possessing it alone lets someone do something costly or harmful with no other check in place.

## 11. Known constraints

- **No native full-text search in Firestore** — per-board search is client-side filtering over already-loaded cards in the MVP; cross-board search (Planned Enhancement) would need a dedicated service like Algolia.
- **No presence system yet** — "who's currently viewing" would need Realtime Database alongside Firestore for ephemeral state; not yet implemented.

## 12. Open technical questions

- Final choice of transactional email provider (Resend vs. SendGrid vs. Postmark).
- Exact set of Firestore composite indexes to pre-provision before launch.
- Whether columns are reorderable (same fractional-indexing approach as cards) — assumed yes, not yet explicitly scoped.
