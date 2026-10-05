# Upstream code health review

Instructions for producing or updating a `tools/cr/M<milestone>_codehealth.md`
tracker from the upstream Chromium history that a `cr<milestone>` branch lifts
Brave across. The tracker lists what in the range Brave should fix, migrate to,
or imitate, as checkboxes to track progress.

Build breaks get fixed during the rebase. This review is for everything else,
and most of it fails silently: the tree compiles and tests pass, but a Brave
override has stopped applying, a Brave-disabled feature is back, or a Brave copy
of upstream code has missed a fix.

## Inputs

- **Range:** the Chromium tags the branch lifts across. The old tag is
  `projects.chrome.tag` in `package.json` on `origin/master`; the new one is the
  same field on the branch, or the subject of its "Update patches from Chromium
  X to Y" commit. Review the whole range, not just its tail. Expect 4000 to 9000
  commits (cr156: `155.0.8059.30..156.0.8078.4`, 8957 commits). Run `git log` in
  `src/`, not in `src/brave`.
- **V8 range:** `v8_revision` in `src/DEPS` at both tags. Run that `git log` in
  `src/v8`.
- **Milestone:** the major version of the new tag. The tracker is
  `tools/cr/M<milestone>_codehealth.md`.
- **What the rebase already fixed:**
  `git log --format='%h %s%n%b' origin/master..origin/cr<milestone>` in
  `src/brave`. These are the build fixes made during the rebase. Each one names
  the upstream commit it follows, and shows which patterns recur.

If the tracker already exists, update it (see
[Updating a tracker](#updating-a-tracker)) rather than writing a new one.

## Ground rules

- Verify every claim statically against the tree: read the upstream diff, the
  Brave code and the headers. Don't build or run tests, and don't list an item
  without having checked that it touches Brave. Verify subagents' findings too
  before writing them in.
- `src/` has Brave's patches applied. Read pristine upstream with
  `git show <tag>:<path>`.
- An item belongs in the tracker only if Brave has code it affects: a call site,
  an override, a plaster, a patch, a `chromium_src` file, a lit_mangler, a
  Polymer modification, a test filter, or presubmit config. Upstream-only churn
  is not an item.
- Something the rebase already fixed is not an item. If the rebase only plumbed
  a new parameter through, check whether the behaviour change behind it still
  needs work. In M157, the WebUI loader origin lock was plumbed through, but no
  Brave data source was opened up.
- Check reverts. For every candidate, search the range for `Revert "<subject>"`
  and for a later reland. Only what's left standing counts.
- Don't trust a green Linux build. Brave sources listed only under `is_win`,
  `is_mac`, `is_android` or `is_ios` in `BUILD.gn` aren't compiled there (in
  M156, a Windows-only browser test called `profile()` on a
  `BrowserWindowInterface*`).
- Name the upstream commit that motivates each item, linked as
  `[<hash>](https://chromium.googlesource.com/chromium/src/+/<hash>)`. V8
  changes live in `src/v8` and link to `.../v8/v8/+/<hash>`.

## Procedure

### 1. Collect the data

Dump the range once, and keep the files for every sweep (and for subagents):

```sh
cd src; A=<old tag>; B=<new tag>; D=/tmp/codehealth; mkdir -p $D
git log --format='%h %s' $A..$B > $D/subjects
git log --format='@@@ %h %s' --name-only $A..$B > $D/files
git log --format='@@@ %H%n%B' $A..$B > $D/bodies
```

Index the upstream files Brave overrides, then list the range commits that touch
them (run from `src/brave`):

```python
import glob, json, os
idx = {}  # upstream path -> how Brave overrides it
def add(path, kind): idx.setdefault(path, set()).add(kind)
for f in glob.glob('chromium_src/**/*', recursive=True):
    if os.path.isfile(f):
        p = f[len('chromium_src/'):]
        if p.endswith('.lit_mangler.ts'):
            add(p[:-len('.lit_mangler.ts')], 'lit_mangler')
        else:
            add(p, 'chromium_src')
for f in glob.glob('patches/**/*.patchinfo', recursive=True):
    sub = os.path.dirname(f)[len('patches'):].lstrip('/')  # v8/, third_party/
    for a in json.load(open(f))['appliesTo']:
        add(os.path.join(sub, a['path']), 'patch')
for f in glob.glob('rewrite/**/*.yaml', recursive=True):
    add(f[len('rewrite/'):-len('.yaml')], 'plaster')

noise = ('BUILD.gn', '.gni', 'DEPS', 'OWNERS', 'about_flags.cc',
         'flag-metadata.json', 'histograms.xml', 'enums.xml', '.grd', '.grdp')
overlap = {}  # commit -> overridden paths it touches
for line in open('/tmp/codehealth/files'):
    line = line.rstrip('\n')
    if line.startswith('@@@ '):
        commit = line[4:]
    elif line in idx and not line.endswith(noise):
        overlap.setdefault(commit, []).append(f'{line} ({",".join(idx[line])})')
```

The noise list drops build files, flag metadata, histograms and strings. Commits
that only touch feature lists are better read in sweep
[b](#b-brave-disablements-and-defaults). About 14% of the range touches files
Brave overrides. The index can't see Brave's Polymer overrides in
`browser/resources/**/br/`, which are keyed by element tag (sweep
[d](#d-webui)), nor test filters and `build/chromium/resources/` (sweep
[g](#g-obsolete-brave-code)).

Finally, collect every crbug and CL that Brave cites (in `chromium_src/`,
`patches/`, `rewrite/`, `test/filters/` and comments), and match them against
the `Bug:`, `Fixed:` and `Reviewed-on:` lines in `bodies`. Match CL numbers
against the bodies of reverts and relands too, since the original CL only
appears in their quoted description. Umbrella bugs (Bedrock, exit-time
destructors) account for most hits; skip them, along with ids that only occur in
a patch's context lines.

### 2. Run the sweeps

Each sweep targets one way Brave gets exposed, and each found real items in
M156/M157 (examples in parentheses). They're independent, so split them across
subagents when you can. Give each subagent the data files, the ground rules and
the M156/M157 examples for calibration. Ask each one for method notes: for every
signal it tried, which sweep it belongs to, what it found (verified items, or
only noise), and how to rerun it. Step 4 uses them.

#### a. Overlap: commits touching what Brave overrides

Group the overlap list by overridden file, so that each override is read once
against every commit that touches it. For each commit, read only the
Brave-relevant part: `git show <hash> -- <overridden paths>`. Look for:

- **The hook point moved.** Upstream moved the call, or the logic, that a
  `#define` or plaster anchors to into another function or file, so Brave's hook
  no longer runs on the path that matters (`ManagedUIHandler::Initialize()`
  moved to another file and chrome://history crashed; clipboard sanitising moved
  into `FrameClipboardContext`).
- **Consolidation.** Several entry points were merged into a new one that skips
  Brave's `_ChromiumImpl` wrapper (`AllowServiceWorker()` and friends became
  `IsAnyStorageAccessAllowed()`, which bypassed Request-OTR). For each embedder
  virtual Brave overrides, compare upstream's callers at both tags.
- **The reach of a `#define` changed.** Count each defined token in the pristine
  upstream `.h` and `.cc` at both tags; a different count means a different
  reach (`#define AppMenu BraveAppMenu` also rewrote `GetAppMenu()` after
  upstream moved it). For `Foo` → `Foo_ChromiumImpl` renames, look for upstream
  calls to `Foo()` inside the same file: those skip Brave's wrapper. A private
  method may never reach the wrapper at all (`CancelBrowserClose`).
- **A predicate Brave pins was removed.** "Remove X from Y" and flag clean-ups
  hard-code the launched branch exactly where Brave forced the other one, which
  re-enables the feature (`IsReplaceSyncPromosWithSignInPromosEnabled` stopped
  gating the avatar "Sign in" pill). Run `git log -S'<predicate>'` for each
  predicate Brave pins in `rewrite/`. Likewise, a Brave kill switch on a
  high-level helper misses callers that upstream switches to a lower-level one.
- **Cached state replaced by parameters.** When upstream starts passing data as
  a parameter "because the member can be stale", any Brave plaster still reading
  the member is stale too (`last_query_.field_id` in
  `AutofillExternalDelegate::DidAcceptSuggestion`).
- **Virtuals changed in classes Brave subclasses.** Diff the virtuals of
  `ContentBrowserClient`, `ExtensionsClient`, `AutofillClient`, `Configurator`
  and other base classes Brave overrides. Removed or split virtuals leave a
  Brave override dead. A new virtual can be a hook that Brave's equivalent
  restriction should use (`ExtensionsClient::IsCapturableURL`).
- **Work deferred to `Layout()`.** Performance CLs that "mark dirty, flush in
  `Layout()`" skip Brave `Layout()` overrides that return early
  (`BraveTabContainer` and accessible tab indices).
- **Visibility-dependent lookups.** Element-tracker lookups only find visible
  views, and Brave usually hides upstream views rather than removing them.
- **Parallel implementations behind flags.** A burst of commits under a new
  directory that rebuilds a UI Brave customizes means a factory that will pick
  between the two (ActionAppMenu, the WebUI toolbar and omnibox). The new path
  constructs the plain upstream class in files Brave doesn't hook, so Brave must
  pin every flag that factory reads.
- **The plaster's intent still holds.** An anchor that matches only proves the
  text is there. Read each touched plaster's descriptions against the pristine
  function at the new tag.

The mechanical checks are cheap, but most real breaks are semantic. One check is
that every non-`BRAVE_` `#define` token still appears in the pristine upstream
file. Another is to intersect the identifiers on each diff's `+`/`-` lines with
Brave's anchors.

#### b. Brave disablements and defaults

Brave turns upstream things off in many places, and upstream keeps moving them:

- **Creation moved to a new owner.** Brave's disabling stub stays where the
  object used to be created (TabHelpers → TabFeatures re-enabled
  `FontPrewarmerTabHelper` and `NetErrorTabHelper`; desktop and Android differ).
  List "Migrate X to TabFeatures / UnownedUserData / BrowserWindowFeatures"
  subjects, and match the class names against Brave's stubs.
- **Feature defaults.** Brave's overrides are the
  `set_feature_flag_default_state` plasters,
  `base/compile_overridden_features.inc`, the json5 plaster for Blink runtime
  features, the feature strings in `renderer/brave_content_renderer_client.cc`,
  and `app/feature_defaults_unittest.cc`. The plaster swaps the macro to
  `BASE_OVERRIDDEN_FEATURE`, so grep for both macros. Classify the features in
  `git diff $A $B -G'BASE_FEATURE\('` as new, gone or flipped.
  - A disabled → enabled flip ("Launch … to 100%", "Enable … by default") is the
    highest-yield signal. Check it against Brave UI and features, not only
    privacy (Android tips promo; Ctrl+Tab MRU duplicating Brave's MRU cycling;
    the bookmark bar IPH). Android Java safe defaults
    (`newMutableFlagWithSafeDefault`) flip together with C++.
  - An override that now equals upstream's default is allowed as a pin against
    upstream sliding back (`rewriters.pyl`), so it isn't an item by itself. Flag
    it only when the override was meant as temporary (Brave reverted
    `kSearchNavigationPrefetch` in M156 once upstream disabled it).
  - When a flag Brave disables gains a new consumer, check whether that consumer
    is a security fix the flag now gates (`AsBlob()` sensitive-entry check
    behind `kFileSystemAccessDirectoryIterationBlocklistCheck`).
  - Superseded or split flags (`kFoo` → `kFooV2`, new params): Brave's override
    no longer gates the behaviour.
  - Use `git diff $A $B -U0 -G'\b(kA|kB|…)\b'` over Brave's pinned features to
    find code paths that stopped checking them.
- **Prefs.** For each `SetDefaultPrefValue` and pref override, check that
  upstream still reads that pref.
- **Profile types and predicates.** New profile kinds, or changed meanings,
  bypass Brave's private-window checks (enterprise isolated mode is no longer
  `IsIncognitoProfile()`). Grep Brave's `IsIncognitoProfile()`,
  `IsOffTheRecord()` and `BrowserProfileType::kIncognito` call sites.
- **New enum values** that Brave's switches send to a `default:` case, and ID
  headroom (command IDs, syncable pref IDs).
- Other lists to check: the origin-trial blocklist
  (`chromium_src/third_party/blink/common/origin_trials/origin_trials.cc`), the
  component ID blocklist, and the Android `GlicEnabling.java` list.

New upstream features that phone home or add Google-service UI aren't
code-health items. List them at the end of the tracker for the privacy team, one
line each.

#### c. Security hardening and forked code

- **Enforcement that updates only upstream's own instances.** Commits that
  "enforce X" and "update the relevant sources to declare Y" fix only upstream's
  subclasses. List Brave's subclasses of the same base and check each one
  (`WebUIURLLoaderFactory` now blocks loads between `chrome-untrusted://` hosts,
  but no Brave data source allows its embedders). Brave subclasses also inherit
  upstream's new restrictive overrides (`PlaylistDataSource : FaviconSource`).
  For WebUI, build a table of requesting page × target host from Brave's CSP
  overrides and the `//host` URLs in the front-end code.
- **Fixes in upstream siblings of Brave forks.** Index the forks:

  - comments such as "copied from", "taken from", "adapted from", "kept in sync"
    ("based on" and "mirrors" are noise unless a path follows);
  - `chromium_src` files that never include the original;
  - `_ChromiumImpl` renames whose Brave body never calls the original;
  - known pairs, such as `BraveProxyingURLLoaderFactory` with
    `WebRequestProxyingURLLoaderFactory`.

  Then run `git log $A..$B -- <originals>`, or `git log -L :<function>:<file>`
  for a single function, and check whether the Brave copy needs the same fix
  (FollowRedirect validation; `bypass_redirect_checks`).

- **New request and storage paths.** Inventory Brave's choke points:
  `WillCreateURLLoaderFactory`, URL loader and navigation throttles, the
  ephemeral storage nonce. Then diff-grep the range for new
  `CreateURLLoaderFactory(`, `SimpleURLLoader::Create`, `URLLoaderFactoryType`
  values and fetch types. For designs where the renderer reads something
  directly, check whether a consumer exists yet, and pin the flag off if it
  would bypass Brave.
- **Fingerprinting.** When upstream adds a way to read back data that Brave
  farbles, check whether it goes through Brave's hook (`VideoFrame.copyTo()` on
  a canvas source skips canvas farbling).
- **Build flag splits.** Grep Brave for the old `BUILDFLAG` and GN arg, and read
  upstream's TODOs about future defaults (key pinning split from the HSTS
  preload list; Brave iOS relies on the pins).
- **Half-reverted changes.** When Brave reverts an upstream change, read the
  whole `--stat`: the change may have a Java or build half that Brave didn't
  revert (the manifest version change also changed
  `VersionInfo.getProductVersion()` on Android).

#### d. WebUI

- **List every Polymer-API target by tag.** Grep the files that import
  `polymer_overriding` for `Register*('tag'`, and for map keys, since one call
  can register several tags. Map each tag to its upstream file with
  `git grep "return 'tag';" $B`. Compare the base class at both tags.
  `polymer_overriding` only hooks Polymer elements, so an override of a Lit
  element silently does nothing (payments and contact-info pages). Check all of
  them, not just the ones that changed in the range: earlier lifts left some
  dead (sync controls, performance page, bookmarks side panel).
- **Check selectors.** For tags still on Polymer, check each `querySelector`
  target against the template at the new tag. A query on the template fragment
  doesn't reach into nested `<template>` (`dom-if`) content.
- **PrefService migration.** List elements that lost the `prefs` property or
  `PrefsMixin`. Check Brave's `{{prefs.…}}` bindings inside them, and any
  `prefs` they pass down to Brave children (the email aliases toggle broke two
  levels down). The fix is `pref-key`.
- **Lit manglers.** `mangle()` throws when its template is missing, which is
  loud. `mangleAll`, `?.` and `if (el)` guards skip silently.
- **Data sources.** See the WebUI CORS item in sweep
  [c](#c-security-hardening-and-forked-code).
- Removed `loadTimeData` keys and handler names, lint rules and `$` typing all
  surface as build errors or crashes during the rebase. They need little
  attention here.

#### e. Enforcement and deprecations

- **V8:**
  `git -C src/v8 log -p <v8 range> -- include/ | grep -E '^[+-].*V8_DEPRECATE|^commit '`.
  Chromium builds with imminent-deprecation warnings, so `V8_DEPRECATE_SOON`
  already breaks. Removed lines show promotions.
- **Headers:** `git log -p -E -G'<pattern>' $A..$B -- '*.h'`, keeping only added
  lines, with patterns such as
  `[Dd]eprecat|DEPRECAT|[Dd]o not use|being removed|will be removed|\[\[deprecated`.
  Git's ERE has no `(?i)`. Run a second pass with
  `[Pp]refer |[Aa]void |[Nn]ew callers` over `base/`, `content/public/`,
  `ui/views/`, `net/` and `mojo/public/`, for guidance that never says
  "deprecated" (`RenderFrameHost::ConsumeTransientUserActivation()`).
  Comment-only deprecations never break the build; `[[deprecated]]`,
  `V8_DEPRECATE*` and abseil's `diagnose_if` do.
- **Presubmit:** Brave inlines `//PRESUBMIT.py` and configures it by check name
  in `chromium_presubmit_config.json5`. A textual diff of `PRESUBMIT.py` is
  useless when upstream reorders it. Instead, diff the set of `def Check*`
  names, each check's body and the `_BANNED_*` lists between the two tags. A
  renamed check leaves Brave's config entry matching nothing (`CheckParseErrors`
  → `CheckJSONParseErrors`). For a changed check, replay its logic over Brave
  files.
- **Clang plugins:** what's enforced today is in
  `build/config/raw_ptr_plugin_config.yaml`; where it's heading is in
  `tools/clang/raw_ptr_plugin/PluginConfig.h` `Default()`. New plugin flags
  signal per-directory enforcement. Path matching is by substring, so
  `brave/third_party/blink/...` is covered too. The checks are off in official
  builds.
- **Warnings:** per-directory enablement shows up as a removed opt-out:
  `git log -G'no_exit_time_destructors' $A..$B -- '*.gn'`. Brave's remaining
  debt is its suppressions (`[[clang::no_destroy]]`).
- **Scripted clean-ups** announce enum removals (`clean-up-not-fatal-until.py`
  deletes old `NotFatalUntil` values). Grep Brave for those values.
- **Commit bodies:** grep them for
  `preempt|upcoming (clang|presubmit|plugin)|will be disallowed|\bLSC\b`.

#### f. Migration campaigns

Cluster the range by `Bug:` id, and by subject tag (`[Bedrock]`,
`[dcheck-to-check]`) and verb ("Migrate X to Y", "Replace", "Convert"). For
clusters of three or more commits, read a representative diff and write down the
old → new idiom. Measure the trend with `git grep -c '<old idiom>'` at both
tags. A falling count means an active campaign (`TabHelpers` creations: 111 at
155, 72 at 156, 45 at 157); a flat count means a stale deprecation that isn't
worth an item. Headers that say "Do not add more public accessors" or carry a
`TODO(crbug)` confirm the direction. Then grep Brave, including
`browser/resources/**/br/`, `rewrite/` and platform-only sources. Report the
count, the list of sites (or the grep command when there are many) and one
upstream example of the new idiom.

Skip ash/ChromeOS, roll, gardening and large feature-bug clusters (Glic, Actor)
unless Brave touches the code.

#### g. Obsolete Brave code

- **Workarounds for upstream bugs that are now fixed.** Each Brave-cited crbug
  or CL that the range fixes is a workaround to delete, or a test filter to drop
  (the `layout_manager_base.cc` plaster waited on a CL whose reland made it a
  no-op).
- **Workarounds upstream removed from its own code.** Brave copied them, or
  added them for the same symptom (`ViewShadow::OnLayerRecreated`;
  single-process `ScopedChromeExtensionsClient` sharing).
- **Workarounds added during this lift.** Developers lift against intermediate
  versions, so the upstream fix can land later in the same range. Re-check every
  patch the rebase commits added (a Widevine dep was added a day after upstream
  added the same line).
- **Hooks made unreachable by an upstream early return** ("Disable X if flag is
  off": the offer-notification promo-code exclusion).
- **Brave changes that upstream adopted.** For each patch, count how often each
  `+` line occurs in the pristine file at both tags. A count that grew means
  upstream added the line too. Count occurrences rather than test membership,
  since the line can already exist elsewhere in the file.
- **Test filters.** Parse the filters into `Suite.Test` names and index the
  `TEST*(Suite, Name)` macros at both tags (strip `MAYBE_`, `DISABLED_` and
  `PRE_`, and record `INSTANTIATE_*` prefixes). For entries that disappeared,
  `git log -S<name> $A..$B` finds the commit; read it, because a renamed test
  needs its filter retargeted, not deleted. A negative filter matches the full
  name exactly, so upstream turning a `TEST_F` into a `TEST_P` silently
  re-enables a filtered test (`All/…/0`). Tests whose `DISABLED_` prefix was
  removed in the range (`git log -p -U0 -G'DISABLED_' $A..$B -- '*test*.cc'`)
  are candidates for dropping a "flaky upstream" filter.
  `tools/cr/prune_test_filters.py` does the existence check with built binaries,
  but it deletes renamed entries.
- **Dead overrides:** `chromium_src` files, Polymer modifications, lit manglers
  and `build/chromium/resources/` files whose target no longer exists upstream;
  `chromium_src` files that replace a header outright and still define what
  upstream deleted; stale entries in `base/compile_overridden_features.inc`.
  Nothing checks these automatically.

#### h. Android and iOS

- **Bytecode adapters.** Resolve each adapter target (class, method, field) at
  both tags. Targets that vanished are dead hooks, and adapter operations
  without a `BytecodeTest` assertion are where they accumulate.
- **Subclass overrides and spoofs.** Check that Brave Java overrides are still
  called. For hooks that pretend to be something, trace whether upstream still
  asks the spoofed method (`TabImpl.isCustomTab()` moved to the tab's delegate
  factory, which killed Brave's reader mode prompt).
- **Hide lists keyed by name.** Brave subclasses that remove upstream
  preferences or menu items by key miss new ones. Diff the XML and menu keys
  across the range (the new "Search AI Mode and connected apps" sync row).
  Upstream strings that newly show up in Brave's rebranded `.grd` files, often
  as mangled Google product names, are a cheap signal.
- **Default flips that switch to a new UI class.** Brave's hide of the legacy
  class doesn't apply to it (the enhanced send-tab-to-self sheet). Brave tests
  that `@DisableFeatures(X)` mark features Brave never validated.
- **Registries and host delegates** keyed by exact class bypass Brave's subclass
  swaps (settings in a tab and `SettingsFragmentRegistry`).
- **Java campaigns:** NullAway `@NullMarked`, supplier types, ErrorProne checks
  such as `DoNotMock`. Count Brave's remaining old-idiom uses and suppressions,
  and grep `@NullMarked` files for androidx nullness annotations, which can't
  annotate type arguments.
- **iOS:** deprecations in the `ios/web` and `ios/chrome` APIs that `brave/ios`
  wraps (`web::ScriptMessage::legacy_body()`), and Brave's copy of upstream's
  provider list in `ios/browser/providers/BUILD.gn`, which misses new providers
  every lift. Full-function replacements in `chromium_src/ios` miss upstream
  security fixes to the original (the WebSocket block for local pages).
- Feature-list and `about_flags` overlaps are noise here; use the feature
  default diff from sweep [b](#b-brave-disablements-and-defaults) instead.

#### i. Subject triage

The sweeps above cover most of what matters. A subject grep catches the rest,
but it is noisy (about 1000 hits in cr156):

```sh
p='codehealth|code health|deprecat|migrate|replace .* with|clean ?up|rename'
p+='|refactor|bedrock|\blit\b|polymer|use-after|uaf|dangling|race|crash'
p+='|consolidat|split|move|enforce|launch|enable .* by default'
grep -iE "$p" $D/subjects
```

Drop platform-only subjects Brave doesn't build or customize (`[ash]`,
`chromeos`, `fuchsia`), Perfetto rolls, gardener test disables and Android test
migrations, unless a Brave override touches the same code.

### 3. Write the items

For each item, record:

- what changed upstream, and why it affects Brave (one or two sentences)
- the motivating upstream commit(s), linked
- one checkbox per unit of work: a call site, field, file, or class, each with
  its path, and a line number when it helps
- the replacement idiom, when upstream's migration commits establish one

The sweeps also find things that predate the range. List those as well, and say
which lift introduced them; no later review will find them otherwise.

### 4. Update this document

Before finishing, fold what the review taught into this file, following
[Maintaining this document](#maintaining-this-document).

## Tracker format

```markdown
# M<milestone> code health follow-ups

Tasks found by reviewing upstream changes in `<range>` (<N> commits) for
regressions, deprecations and code-health migrations that apply to Brave. Tick
items off as they land.

## 1. Regressions

## 2. Upcoming deprecations

## 3. Code-health migrations

## 4. Obsolete Brave code

## 5. Optional

## For privacy review
```

Each numbered section holds `###` items, each with its explanation and
checkboxes. Leave out empty sections, and order items within a section by
urgency. Regressions go first: silent ones, then those only some platforms
build. "For privacy review" is a plain list, one line per upstream feature.

Format the file afterwards with `pnpm run format --base HEAD`. Without
`--base HEAD`, it formats everything the cr branch changed since
`origin/master`. It skips untracked files, so run
`node_modules/.bin/prettier --write` on a new tracker.

## Updating a tracker

When the tracker already exists, for a new range or a re-check:

- Keep ticked items, and keep their notes.
- Re-verify the open items: if the code an item names is gone or already
  migrated, tick it and say so. If the item no longer applies, close it with a
  one-line reason, as done for evaluated-and-skipped items.
- Add new items under the right section. Don't duplicate an existing item;
  extend its checkbox list instead.
- Update the range and commit count in the intro.

## When fixing items

- Whole-file formatters can add unrelated churn (e.g. `InsertBraces` in Brave's
  clang-format config), so format changed lines only.
- `std::string` results of a removed API are often only an intermediate. Pass
  the bytes on directly (e.g. to `base::Base64Encode` or `base::HexEncode`)
  rather than converting back to a string.
- For enum ↔ string mappings, `//base` has no reflection. Use a constexpr
  `base::fixed_flat_map` for name → enum, and an `operator<<` (picked up by
  `base::ToString`) for enum → name.
- Polymer overrides of an element that became Lit move to a lit_mangler named
  after upstream's input (`foo.html.ts.lit_mangler.ts`). Hide nodes rather than
  removing them when the element's `$` interface declares them.
- When a fix restores a disablement, add a test that fails if upstream moves the
  code again, e.g. a browser test checking that the helper isn't created, or an
  entry in `app/feature_defaults_unittest.cc`.

## Maintaining this document

This file should grow from evidence and shrink when a heuristic stops paying
off. Update it at the end of every review.

### Inputs

- **Method notes** from each sweep: which signals found verified items, and
  which were only noise.
- **Each verified item.** Note which sweep found it. If no sweep describes the
  mechanism behind it, that's a missing heuristic.
- **Misses.** These are problems in an already-reviewed range that surfaced
  later, through a later rebase, a bug report or a fix. They're the most
  valuable input. Look in `src/brave` history for commits whose "Chromium
  changes:" link names an upstream commit from a range an earlier tracker
  covered. Add the heuristic that would have caught each one.

### Adding a heuristic

- Add only what found a verified item, or what would have caught a verified
  miss.
- Put it under the sweep it belongs to. Create a sweep only for a new way Brave
  gets exposed.
- Write one bullet per mechanism: the signal, how to check it (a command or a
  short recipe), and one concrete example in parentheses.
- Keep it range-independent. File lists, line numbers and counts go in the
  tracker.
- Tag new examples with their milestone, e.g. `(M158: …)`. Untagged examples
  date from M156/M157.
- If a bullet for the same mechanism exists, refresh its example or sharpen its
  check rather than adding a near-duplicate.

### Removing or demoting a heuristic

- Remove it when its mechanism is gone (e.g. no Brave code left on Polymer
  overrides), or when tooling now enforces it (a presubmit check, a test, an
  error at runtime). If the tool's name helps a future reviewer, leave a
  one-line pointer to it.
- When a signal produced only false positives, move it into its sweep's noise
  note, so the next reviewer doesn't retry it.
- Remove a heuristic whose newest example is three milestones old and that found
  nothing in the meantime.
- When a check is mechanical and has found items in two reviews, propose a
  script under `tools/cr/` or a presubmit check as an optional tracker item.
  Once it lands, shorten the bullet to point at it.

### Keeping it usable

- Lessons about implementing fixes go under
  [When fixing items](#when-fixing-items), not in the sweeps.
- Prefer replacing text to appending it, so the file stays readable in one pass.
- Commit changes to this file separately from the tracker, and give the evidence
  in the message (e.g. "found X in M158", "only noise in M157 and M158").
