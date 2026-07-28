# Product Requirements Document: Collaborative Kanban Board

*Working title. Companion docs: [`engineering-design.md`](./engineering-design.md), [`architecture.html`](./architecture.html), [`user-flow.html`](./user-flow.html), [`ui-wireframes.html`](./ui-wireframes.html).*

## 1. Overview

A real-time, multi-user Kanban board — create boards, organize work into columns and cards, and collaborate live with the people you invite. Built on Next.js + React + TypeScript + Firebase + Tailwind.

## 2. Goals

- **Primary:** a genuinely useful shared task board for collaborators, usable without onboarding friction.
- **Secondary (equally load-bearing):** a portfolio piece that demonstrates production-grade engineering judgment — concurrency correctness, derived vs. current state, and deliberate use of external APIs — not just CRUD screens.

## 3. Target users

Groups collaborating on a shared set of tasks: friends planning a trip, roommates splitting chores, a project team, a study group.

## 4. Core user stories

- As a board owner, I can create a board and invite collaborators by email so they can join and start contributing, whether or not they already use the app.
- As a collaborator, I see the board update live as others move or edit cards, with no refresh needed.
- As a user, I can drag a card to a new column or position and have it land correctly even if someone else is moving a card in the same column at the same moment.
- As a user, I can see a feed of recent activity on the board.
- As a board owner, I can set a background image for the board by searching Unsplash.

## 5. Functional requirements (MVP)

### 5.1 Boards, columns, cards
- Create/read/update/delete boards, columns, and cards.
- Cards support title and description only for now.

### 5.2 Real-time collaboration
- All board/column/card changes sync live to every connected collaborator via Firestore `onSnapshot` listeners.
- Card reordering uses **fractional indexing** (sortable rank strings) so a single move writes one document instead of renumbering a column.
- Position and column writes happen inside a **Firestore transaction** (optimistic concurrency): if a card changed since it was read, the write aborts and the SDK retries automatically against fresh data — never a silent last-write-wins overwrite.

### 5.3 Activity feed (derived state)
- Every card edit (title, description, column/position change) appends an immutable **version** record in the same transaction as the field update — this log is internal, powering the feed below, not a user-facing history screen.
- A Firestore-triggered Cloud Function formats each new version into a readable line and writes it to a materialized `activityFeed` collection per board — read via a real-time listener, not recomputed on every page load.

### 5.4 Invites & onboarding
- Board owner invites a collaborator by email.
- Every invite triggers an email via an external transactional email API (Cloud Function triggered on invite creation) — new users get a signup/join link, existing users get a "shared with you" link back into the app. Same channel for both, no push-notification branch.
- Invite status tracked (`pending` / `accepted` / `expired`).

### 5.5 Board customization
- Board owner searches Unsplash and sets a board background image via a Next.js API route that proxies the request server-side, so the Unsplash Access Key is never exposed to the client.
- Selected image is a plain field on the board document; photographer attribution is displayed per Unsplash API terms, and the download-tracking ping fires on selection.

## 6. Non-functional requirements

- Real-time updates propagate via listener push, not polling.
- No silent data loss under concurrent edits to the same card or the same column's ordering.
- Secrets (Unsplash key, email provider key) live only server-side (env vars / Cloud Function config) — never shipped in client code. Firebase's client config is not treated as a secret; access is instead enforced by security rules.
- Only board members can read or write a given board's data, enforced by Firestore security rules — not just hidden in the UI.

## 7. Technical architecture (summary)

- **Frontend:** Next.js, React, TypeScript, Tailwind.
- **Data:** Firestore — current state in `boards` / `columns` / `cards`; derived state in `cards/*/versions`, `activityFeed`, `invites`.
- **Backend logic:** Firestore-triggered Cloud Functions for event-driven work (activity feed formatting, invite emails); a Next.js API route for request/response proxying of third-party calls that require a secret key (Unsplash search).
- **External services:** transactional email API (invites), Unsplash API (backgrounds).
- Full component, data-model, and sequence diagrams live in the companion architecture artifact.

## 8. Out of scope (deliberately deferred, with rationale)

- **WIP limits, cycle-time/lead-time analytics, generic card aging** — process-discipline features that assume a team has adopted a formal, audited workflow. Cut because the app's collaboration model doesn't call for enforcing a workflow, not because they're hard to build.
- **Whole-board time travel / point-in-time snapshots** — would require reconstructing a consistent state across every card on the board at once from the event log, a meaningfully bigger lift than restoring a single card's history. Deferred as a stretch goal.
- **Push notifications** — considered for ongoing-activity alerts, cut in favor of the invite-email channel plus the in-app activity feed, avoiding service-worker/token-management infrastructure not central to the demo.

## 9. Open questions / stretch goals

- **Presence** (who's currently viewing/editing a board) — likely needs Realtime Database alongside Firestore for ephemeral state; not yet scoped in detail.
- **Believable derived-state additions** — per-person workload counts, due-date badges, board completion percentage. Not yet prioritized into a phase.
- **Card attachments with searchable metadata** — Firebase Storage for the file, a Firestore metadata index for search, optionally Cloud Vision API auto-tagging on upload. Discussed as a natural extension, not yet scoped.

## 10. Planned enhancements

- **Cross-board / global search** — search for cards across every board you're a member of, not just the one currently open. Firestore has no native full-text search, so a real version needs a dedicated search service (Algolia/Typesense) rather than the per-board client-side filtering the MVP would use.
- **Version history & restore** — view a card's past edits and roll back to an earlier version, guarded by a version-number concurrency check so a restore can't silently clobber a concurrent edit.
- **Image & video attachments on cards** — upload media to a card instead of plain text only, stored in Firebase Storage with a reference on the card document.
- **Card metadata: due dates and assignee(s)** — additional fields on the card document beyond title/description, opening the door to derived features like overdue badges or per-person workload counts later.
- **Testing & monitoring** — automated test coverage (unit tests for concurrency-critical logic like fractional-index generation and transaction retry behavior, plus Firestore security-rules tests) and production error/performance monitoring (e.g. Sentry) once there's real usage to observe.

## 11. Definition of done (portfolio criteria)

- Demonstrable live with two accounts in two windows: real-time sync, a concurrent-drag scenario that doesn't lose data, an activity feed update, an invite email arriving, and a board with an Unsplash background.
- Every included feature maps to a specific, explainable architecture decision — and every deferred feature maps to a specific, explainable reason it was cut. Both are equally good interview material.
