# Upstream code health review

Instructions for producing or updating a `tools/cr/M<milestone>_codehealth.md`
tracker from a range of upstream Chromium history. The tracker lists what in the
range Brave should fix, migrate to, or imitate, as checkboxes to track progress.

## Inputs

- **Range:** two Chromium tags, e.g. `157.0.8082.1..157.0.8085.1`. Run `git log`
  in `src/` (the Chromium checkout), not in `src/brave`.
- **Milestone:** the major version of the range's end tag, e.g. `157`. The
  tracker is `tools/cr/M157_codehealth.md`.

If the tracker already exists, update it (see [Updating](#updating-a-tracker))
rather than writing a new one.

## Ground rules

- Verify every claim statically against the tree: grep for Brave uses, read the
  upstream diff, and read the headers. Don't build, and don't list an item
  without having checked that it touches Brave.
- An item belongs in the tracker only if Brave has code it affects: a call site,
  an override, a plaster, or a `chromium_src` file. Upstream-only churn is not
  an item.
- Check reverts. For every candidate, search the range for a
  `Revert "<subject>"` and for a later reland. Only what's left standing counts.
- Name the upstream commit that motivates each item, linked as
  `[<hash>](https://chromium.googlesource.com/chromium/src/+/<hash>)`. V8
  changes live in `src/v8` and link to `.../v8/v8/+/<hash>`.

## Procedure

### 1. Triage by subject

There are usually more than a thousand commits, so start from subjects:

```sh
p='codehealth|code health|tidy|iwyu|spanify|unsafe.?buffer|deprecat|migrate'
p+='|rewrite|replace .* with|remove (unused|dead|deprecated)|clean ?up|rename'
p+='|modernize|raw_ptr|miracleptr|constexpr|refactor|bedrock|\blit\b|polymer'
p+='|use-after|uaf|dangling|leak|race|crash'
git log --format='%h %s' <range> | grep -iE "$p"
```

Drop platform-only subjects Brave doesn't build or customize (e.g. `[ash]`,
`chromeos`, `fuchsia`), Perfetto rolls, gardener test disables, and Android test
migrations, unless a Brave override touches the same code.

### 2. Check each theme against Brave

Group candidates into themes, then check each theme for Brave exposure. These
are the themes worth looking for in every range:

- **Silent regressions from WebUI migrations.** Upstream moves WebUI elements
  from Polymer to Lit (`Settings Lit: Migrate ...`). Brave customizes Polymer
  elements with `RegisterPolymerTemplateModifications` and
  `RegisterPolymerPrototypeModification` (`browser/resources/settings/br/*.ts`
  and similar), and those stop applying to a Lit element without any build
  error. For each migrated element, check whether Brave overrides it, and
  whether its class now extends `CrLitElement`. Such items go first in the
  tracker. The fix is a lit_mangler (`chromium_src/**/<file>.lit_mangler.ts`,
  named after upstream's input: `foo.html.ts` or a raw `foo.html`).
- **Deprecations.** Look for `V8_DEPRECATE_SOON` (in `src/v8`, e.g.
  `FunctionCallbackInfo::Data()` → `DataV2()`), and for headers marked
  "deprecated and being removed" (e.g. `crypto/sha2.h` → `crypto/hash.h`).
  Upstream's per-directory migration commits show the replacement idiom; reuse
  it.
- **Upcoming enforcement.** Commits saying they "preempt" a clang-plugin or
  presubmit change, e.g. MiraclePtr in containers. Check what's enforced today
  in `build/config/raw_ptr_plugin_config.yaml`, and grep Brave for what the next
  step will ban.
- **Architecture migrations.** Upstream moving patterns Brave also uses, e.g.
  TabHelpers → `TabFeatures` (`chrome/browser/ui/tab_helpers.h` warns against
  `TabHelpers` on desktop). List the Brave classes still on the old pattern,
  e.g. those created in `browser/brave_tab_helpers.cc`.
- **Removed or renamed APIs that Brave still references.** Usually these already
  fail the build during the rebase, so they're fixed there rather than tracked.
  Only list them if something still references them without breaking the build:
  docs, filters, `.gni` lists.
- **Bug fixes worth imitating.** UAF, dangling-pointer and race fixes in code
  that Brave subclasses, plasters, or replaces in `chromium_src`. Check whether
  Brave's copy needs the same fix, or already inherits it.
- **New `//base` utilities.** Note them only if Brave has a concrete place that
  would benefit. Mark those items optional, and check whether upstream has
  adopted the utility yet.

Useful greps from `src/brave`, excluding `node_modules`, `third_party` and
`vendor`:

```sh
grep -rn --include=*.cc --include=*.h --include=*.mm <symbol> .
grep -rln RegisterPolymerTemplateModifications browser/resources
```

### 3. Write the items

For each item, record:

- what changed upstream, and why it affects Brave (one or two sentences)
- the motivating upstream commit(s), linked
- one checkbox per unit of work: a call site, field, file, or class, each with
  its path, and a line number when it helps
- the replacement idiom, when upstream's migration commits establish one

## Tracker format

```markdown
# M<milestone> code health follow-ups

Tasks found by reviewing upstream changes in `<range>` (<N> commits) for
regressions, deprecations and code-health migrations that apply to Brave. Tick
items off as they land.

## 1. Regressions

## 2. Upcoming deprecations

## 3. Code-health migrations

## 4. Optional
```

Each section holds `###` items, each with its explanation and checkboxes. Leave
out empty sections. Order items within a section by urgency.

Run `pnpm run format` on the file afterwards.

## Updating a tracker

When the tracker already exists, for a new range or a re-check:

- Keep ticked items, and keep their notes.
- Re-verify the open items: if the code an item names is gone or already
  migrated, tick it and say so. If the item no longer applies, close it with a
  one-line reason, as done for evaluated-and-skipped items.
- Add new items under the right section. Don't duplicate an existing item;
  extend its checkbox list instead.
- Update the range and commit count in the intro.

## Lessons from M157

- Polymer → Lit migrations break Brave silently; check every one of them.
- Whole-file formatters can add unrelated churn (e.g. `InsertBraces` in Brave's
  clang-format config), so format changed lines only when fixing items.
- `std::string` results of a removed API are often only an intermediate. Pass
  the bytes on directly (e.g. to `base::Base64Encode` or `base::HexEncode`)
  rather than converting back to a string.
- For enum ↔ string mappings, `//base` has no reflection. Use a constexpr
  `base::fixed_flat_map` for name → enum, and an `operator<<` (picked up by
  `base::ToString`) for enum → name.
