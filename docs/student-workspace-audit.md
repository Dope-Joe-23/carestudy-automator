# Student workspace audit and implementation plan

## Current application

The student experience is `artifacts/carestudy-assistant`, a React, Vite, Wouter, and TanStack Query application. Its API is the Express service in `artifacts/api-server`, backed by the workspace database package. The repository does not contain a Django student portal.

### Existing student routes and capabilities

- `/` (and `/student`, `/student/workspace`): the student workspace, now the application home; guests see a sign-in view instead of the account summary.
- `/student/orders`: authenticated order list.
- `/student/orders/new`: care-study order form with validation and uploaded supporting files, opened as a dialog over the projects list.
- `/student/orders/:id`: authenticated order details and status, rendered in the portal's content pane.
- `/student/orders/:id/preview`: read-only study preview for ready, owned orders.
- `/student/downloads`: delivered studies and PIN-gated download history.
- `/nurseflow`: existing student question-bank and quiz experience.
- `/studio`: separate, admin-gated care-study drafting workspace, including a study-specific assistant.
- `/studio/bin`: staff workflow for producing and delivering student orders.

Student authentication uses bearer tokens and `/api/students/*`. Student order APIs enforce ownership for order lists, details, previews, downloads, and payments. Payment initialization, Paystack verification, and payment-status endpoints exist. Delivery downloads also follow the current staff-managed PIN release rules. These routes and rules must remain authoritative.

### Capabilities not present

- No general student conversation API, persistent conversation/message storage, or conversation history.
- No general student-facing assistant endpoint. The existing study assistant is scoped to an admin-authenticated study editor.
- No student assignment or presentation assistant, research workspace, or general study library.
- The portal has no independent payment-history page; payment details are associated with orders.

These gaps should be implemented behind real authenticated API capabilities before the UI presents them as live services. The UI must not simulate chat answers, orders, payment confirmations, or source citations.

## Incremental implementation plan

1. Keep the existing order, preview, download, payment, and NurseFlow routes intact and document their current contracts.
2. Add an authenticated workspace entry point with clear direct links to live services and visible status for planned tools.
3. Add a persistent conversation backend with student ownership checks and context handling before enabling general chat.
4. Connect the existing student-safe care-study capabilities; keep staff-only editor routes protected and route commerce actions into the existing order flow.
5. Implement additional academic tools only when their backend workflows exist, then validate responsive behavior and regressions against existing student APIs.

## Changes in this increment

The student workspace is now the application home at `/` (also served at `/student` and `/student/workspace`) and is the entry point to every student service. It shows the signed-in student's account details — or a guest view with sign-in and account-creation links when nobody is signed in — and links directly to care-study ordering, orders, downloads, and NurseFlow. Assignment, presentation, and research are labeled as planned, and general chat is identified as not connected because there is no persistent student conversation service yet.

`/` no longer serves the NurseSpin question bank; practice MCQs stay at `/nurseflow` and `/nursespin` and are linked from the workspace. `/welcome` is now the admin/staff landing page only — students and guests are redirected to the workspace.

Routing note: the portal is mounted without wouter's `nest` option so that its `/student/...` links and the links leaving the portal (for example `/nurseflow`) resolve against the real URL instead of being prefixed twice.

Student sign-in and registration are a single dialog rather than pages. `/login` and `/student/register` (including staff invite links) still work: they open the dialog over the workspace and settle on `/`. The same dialog is opened in place from the workspace, its sidebar, and the studio gates. Placing an order is also a dialog — the `/student/orders/new` page and its sidebar tab are gone, and the old URL opens the dialog over the projects list.

The portal renders its own persistent layout outside the keyed page transition, so moving between workspace, projects, downloads, and an order's details only replaces the content pane; the sidebar is not remounted.

Validation: the care-study assistant TypeScript check and production build pass, and the guest workspace plus its route targets were checked in the running dev server. Signed-in student behavior and commerce flows still require a configured API, a registered student, and a payment-provider environment.
