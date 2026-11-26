# Sites and workspaces

Each creator site is one Buildbase workspace. Buildbase keeps what it's good
at: the site's name and picture, its teammates and their roles, and later
its billing. The app's database keeps the site itself: its handle, status,
pages and versions ([DATABASE.md](DATABASE.md)), under the workspace's id.

A creator can have several sites and switch between them; teammates invited
to a workspace work on that site with the role they were given.

## Addresses

| Address                 | Page                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `/`                     | No sites: on to `/new`. One site: on to it. More: the list of sites.          |
| `/new`                  | Make a site: its name and its handle on levuche.page.                         |
| `/sites/<workspace id>` | The site's overview: status, link and Copy. "Page not found" for non-members. |

## Making a site

`createSite` (`src/app/(app)/new/actions.ts`) checks the name and the handle
(`src/lib/handle.ts`), makes the Buildbase workspace, then the site, its
handle and its home page with the starting layout (`src/lib/starter.ts`) in
one database batch. If the handle is taken, the
workspace is deleted again, so a workspace never stands without its site.
Buildbase's own refusals become plain messages: a name the creator already
uses (409), or as many sites as the account allows (402, 403).

### Claiming a handle

A handle is 3 to 30 lowercase letters and numbers with single hyphens
between them. Levuche's own words, words a visitor could take for an
official page, and well-known brands are kept back (`RESERVED_HANDLES` in
`src/lib/handle.ts`); the team can keep more back as `reserved` rows in the
`handles` table. A handle is unique across every site, and stays held for a
while after its site is deleted (a `held` row), so old links never land on
someone else.

As the creator types, the form asks `/api/handles?handle=…` (signed in only)
after a short pause and says whether the address is free, taken or kept
back; for a taken one it offers up to three free names close to it. The
form still works without its script, and `createSite` checks again.

### The starting layout

Every new home page opens with a profile header (named after the site), a
row of social icons and a list of links, in that order. The lists start
empty, so nothing made up can go live: the editor asks for them, and the live
page leaves out a block until it's filled in. Where each block sits on a
phone, a tablet and a desktop comes from the grid's own arrangement until
the creator moves something. More layouts to pick from, colours and fonts
come later (#3).

Buildbase's switcher hides its own "Create workspace" button, so every site
is made through `/new` with a handle.

## Taking a site offline

A site's admins can take a live site offline from its overview, and put it
back: `setSiteOffline` (`src/app/(app)/sites/[workspaceId]/actions.ts`)
checks the role with Buildbase on every call, and `siteStore.setOffline()`
only moves a site between `live` and `offline`, keeping its live version.
A site the Levuche team paused, or one never published, doesn't move.
Visitors see an "offline" page meanwhile (#23). Deleting a site comes later.

## Publishing

`/sites/<workspace id>/publish` (#21), reached from "Publish" on the
overview. Admins and editors publish; viewers see the versions.

- **Checks first:** `publishProblems` (`src/lib/publish.ts`) lists every
  block that isn't ready as "Needs a fix", with a link that opens the
  editor on that block (`?block=<id>`): needed fields left empty, list
  items half filled in, links that won't open and pictures not on https.
  Publish shows only when the list is empty.
- **Buying the page (#19):** a site goes live only once its workspace
  holds the `site` feature, as Buildbase composes its entitlement
  (`isPaid` in `src/lib/billing.ts`; anything but an explicit yes is no).
  Publishing, "Make live" and "Put back online" all check it on the
  server. Until then the publish page shows "Buy your page to publish it"
  with the price Buildbase offers. The add-on is found by what it grants
  (the `site` feature), so its slug, name, price and terms live in
  Buildbase (Billing > Add-ons), never in the code. "Buy for …" (admins,
  who hold `workspace:billing:manage`) opens Buildbase's checkout and
  comes back to the publish page with `?done=paid` or `?done=not-paid`;
  editors are asked to get an admin to buy it. Building, editing and the
  private preview link stay free. Receipts are under "Billing and
  receipts" on the overview, Buildbase's own subscription screen. The
  levuche.page Worker checks the same feature before serving a live site
  (#23).
- **Publishing** copies the draft into the next numbered version with an
  optional note and makes it live (`siteStore.publish`). An offline site
  stays offline, with the new version ready for when it's put back; a
  paused one can't be published.
- **Versions** lists each publish with its note, who published it and
  when; "Make live" on an older one makes it live again and keeps the
  draft. The overview says "Live, version N", and "Draft has changes" while
  the draft differs from the live version.
- **Private preview link:** `/draft/<token>` on the app shows the draft's
  home page to anyone with the link, signed in or not, as it would go live.
  It's sent with `noindex`, `no-store` and `no-referrer`. Turning it off
  stops the link working, and turning it on again makes a new one. It
  doesn't work for a paused site.
- The live site's cache is cleared on publish and rollback once
  levuche.page serves sites (#23).

## Roles and checks

Set up in the Buildbase development environment (Settings > Workspaces);
production needs the same before launch:

| Role   | May                                                        |
| ------ | ---------------------------------------------------------- |
| admin  | everything, including teammates, billing and the site      |
| editor | change the site (`app:site:edit`)                          |
| viewer | look at the site (the role a new teammate gets by default) |

`app:site:edit` is the app's own permission ("Edit the site"). A creator
can have up to 5 sites, and new accounts start with none (no workspace is
made for them).

Every page and server function goes through `src/lib/sites.ts`:

- `listSites()`: the signed-in creator's sites.
- `getSite(workspaceId)`: the site, the creator's role and `can(permission)`,
  asked of Buildbase once per request. Anyone who isn't a member gets
  `notFound()`, the same as for a site that doesn't exist, so site ids can't
  be probed.

A server function that changes a site must check
`can(SITE_EDIT)` itself before it writes, whatever the page showed, as the
editor's do (`src/app/(app)/sites/[workspaceId]/edit/actions.ts`).

## The page editor

`/sites/<workspace id>/edit` edits the site's home page (#20). On the left,
the page's blocks in reading order (Up, Down, Remove, and "Add a block"),
and the selected block's settings; on the right, the page as visitors will
see it, on a phone, a tablet or a computer. Admins and editors change it;
viewers see the same screen with nothing to change.

- **Which blocks:** `EDITOR_BLOCKS` in `src/lib/blocks.ts`, the core blocks
  from @levuche/ui (profile, social icons, links, text and a picture).
- **The settings panel** is drawn from each block's settings in the
  @levuche/ui registry (`blockPanel`, drawn by
  `src/components/settings-fields.tsx`), plus a few of the shared look
  fields under "Look". A new prop in ui shows up in the panel by itself.
- **Saving:** each change saves the block's settings as the draft once
  typing stops (`saveBlock`), and the status line says "Saving…", "All
  changes saved." or what went wrong. Only the fields the panel has are
  kept (`savedProps`), up to 20,000 characters a block and 60 blocks a page.
- **What shows:** `readyProps` checks every value as the page is drawn: a
  link must be safe, a picture an https address (uploads come with #24),
  and list items still being filled in are left out. A block whose needed
  fields are empty is left off the page; the editor shows "Add … to show
  this block." in its place. `pageBlocks` in `src/components/page-blocks.tsx`
  turns saved blocks into the grid's blocks for the editor and, later, the
  live page.
- **Layout** follows the page's frame and the grid's own arrangement on
  each screen; moving blocks by hand on the grid comes later.

Nothing reaches visitors until the site is published (see Publishing).

## The switcher and settings

`SiteSwitcher` (`src/components/site-switcher.tsx`) is Buildbase's
workspace switcher in the header. Buildbase's current workspace follows the
page, so the switcher marks the open site and Buildbase's settings open for
it; picking another site opens its page. `OpenSiteSettings` opens
Buildbase's screens for the site's name and picture, and its teammates.

When something changes in those screens (a rename, a teammate, a role), the
provider re-renders the server's pages (`handleEvent` in
`src/components/buildbase-provider.tsx`). Buildbase's danger zone is hidden:
taking a site offline and deleting it come with #26, which also frees its
handle.

## Tests

`e2e/sites.spec.ts` makes sites against the stand-in Buildbase server
(`e2e/mock-buildbase.mjs`, where any session starting `e2e-` is a creator of
its own) and a local D1 database: a first site, a taken handle, a site
outside the creator's workspaces, a viewer, and the switcher.
`e2e/editor.spec.ts` fills in a link and sees it saved, adds, moves and
removes blocks, and checks a viewer can't change anything.
`e2e/publish.spec.ts` lists what needs a fix, publishes, rolls back,
turns the preview link on and off, and checks a viewer can't publish.
