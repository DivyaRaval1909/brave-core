# M157 code health follow-ups

Tasks found by reviewing upstream changes in `156.0.8078.4..157.0.8086.1` (4486
commits) for regressions, deprecations and code-health migrations that apply to
Brave. Tick items off as they land.

Cross-range migrations live here, as do pre-existing problems found during the
review, marked as such. Items specific to cr156 are in `M156_codehealth.md`.

## 1. Regressions

### Brave chrome-untrusted:// pages can't load images or media from other hosts

`WebUIURLLoaderFactory` now locks a `chrome-untrusted://` frame's subresource
factory to the frame's origin. It rejects loads from another
`chrome-untrusted://` host with `ERR_FAILED`, including no-cors `<img>` and
`<video>`, unless the target data source's
`GetAccessControlAllowOriginForOrigin()` returns `*` or the initiator
([738f50bbfc2b9](https://chromium.googlesource.com/chromium/src/+/738f50bbfc2b9)).
Upstream opened up only its own sources (shared resources, theme, favicon2 for
data-sharing). The rebase plumbed the origin lock through, but no Brave data
source overrides the method. `PlaylistDataSource` subclasses `FaviconSource`, so
it inherits favicon2's data-sharing-only rule. This fails silently. Follow
`ThemeSource::GetAccessControlAllowOriginForOrigin()` and
`FaviconSource::GetAccessControlAllowOriginForOrigin()`.

- [ ] `browser/playlist/playlist_data_source.h`: allow playlist and
      playlist-player (media, thumbnails, favicons;
      `components/playlist/content/browser/resources/utils/urlFixer.ts`)
- [ ] `browser/ui/webui/untrusted_sanitized_image_source.h`
      (chrome-untrusted://image): allow nft-display, market-display and
      leo-ai-conversation-entries
- [ ] `browser/ui/webui/brave_sanitized_image_source.h`
      (chrome-untrusted://brave-image, when `serve_untrusted_`): allow news
- [ ] chrome-untrusted://favicon2 for leo-ai-conversation-entries
      (`browser/ui/webui/ai_chat/ai_chat_untrusted_conversation_ui.cc:508`):
      `chromium_src` override of `FaviconSource`, or a Brave subclass
- [ ] Add a browser test per page that loads one cross-origin image or media URL

### Autofill page toggles lost their pref binding

Upstream removed `PrefsMixin` and the `prefs` property from
`settings-autofill-page`
([8704780af8d79](https://chromium.googlesource.com/chromium/src/+/8704780af8d79)).
`br/autofill_page.ts` still injects a toggle bound with
`pref="{{prefs.brave.autofill_private_windows}}"`, which now resolves against a
property that no longer exists, so the toggle is not tied to the pref. This
fails silently. Other Brave toggles in Polymer templates use `pref-key` (e.g.
`brave_personalization_options.html`). The same commit dropped `prefs` from
`settings-autofill-page-index`, and `settings-main` no longer passes it down, so
the Email Aliases page Brave injects there lost its prefs too.

- [x] `browser/resources/settings/br/autofill_page.ts:177`: replace `pref` with
      `pref-key="brave.autofill_private_windows"`
- [ ] Email Aliases toggle: bind
      `pref-key="brave.email_aliases.new_alias_autofill_suggestion_enabled"` in
      `browser/resources/settings/email_aliases_page/email_aliases_page.html:8`,
      drop `PrefsMixin` from `email_aliases_page.ts`, and drop
      `prefs="{{prefs}}"` from the injection in `br/autofill_page.ts:206`

### Brave Origin page extended the removed Polymer `RelaunchMixin`

Upstream removed the Polymer `RelaunchMixin`
([f8a31c97957df](https://chromium.googlesource.com/chromium/src/+/f8a31c97957df)).
The page failed `tsc` on the missing module.

- [x] Migrate
      `browser/resources/settings/brave_origin_page/brave_origin_page.ts` to Lit
      with `RelaunchMixinLit`

### Security page overrides no longer apply

Upstream migrated `settings-security-page` to Lit
([7b7de39620ae0](https://chromium.googlesource.com/chromium/src/+/7b7de39620ae0),
[a47b9d1ed1570](https://chromium.googlesource.com/chromium/src/+/a47b9d1ed1570)).
`browser/resources/settings/br/security_page.ts` still uses
`RegisterPolymerTemplateModifications`, which never runs for a Lit element, so
the hidden settings are visible again. This fails silently.

- [x] Port `br/security_page.ts` to
      `chromium_src/chrome/browser/resources/settings/privacy_page/security/security_page.html.lit_mangler.ts`
      and remove the Polymer override:
  - [x] Hide `safeBrowsingReportingToggle`.
  - [x] Hide `safeBrowsingEnhanced`.
  - [x] Set `no-collapse` on `safeBrowsingStandard`.
  - [x] Hide `passwordsLeakToggle`.
  - [x] Hide `httpsOnlyModeToggle` when `isHttpsByDefaultEnabled`.
  - [x] Hide `advancedProtectionProgramLink`.

### Contact info page shows an empty email verification card

Upstream migrated `settings-contact-info-page` to Lit
([cb62481537773](https://chromium.googlesource.com/chromium/src/+/cb62481537773)).
`browser/resources/settings/br/contact_info_page.ts` hid the card around the
email verification block, and no longer runs. With `kEmailVerificationProtocol`
off in Brave, the card renders with only its heading.

- [ ] Port `br/contact_info_page.ts` to a lit_mangler for
      `autofill_page/contact_info/contact_info_page.html.ts` that hides the
      `.card` containing `#emailSharedMenu` (declared in `$`, so hide it rather
      than remove it), and remove the Polymer override

### Upstream Ctrl+Tab MRU toggle duplicates Brave's MRU cycling

Upstream enabled `kCtrlTabMru` on desktop
([d97db62955747](https://chromium.googlesource.com/chromium/src/+/d97db62955747)).
Appearance settings now show its toggle (`browser.ctrl_tab_mru`). When it's on,
`IDC_CYCLE_TO_NEXT_TAB`/`PREV_TAB` go to the cross-window `CycleToMruTab`,
bypassing `BraveTabStripModel::SelectNextTab`, which implements Brave's own
`brave.mru_cycling_enabled`. Users now get two settings with different
behaviour.

- [ ] `rewrite/chrome/browser/ui/ui_features.cc.yaml`: ship `kCtrlTabMru`
      disabled, with `base/compile_overridden_features.inc` and
      `app/feature_defaults_unittest.cc`, which also hides the toggle
- [ ] Longer term: decide whether to move `brave.mru_cycling_enabled` onto
      upstream's pref and drop Brave's MRU code
      (`browser/ui/tabs/brave_tab_strip_model.cc:80`)

### File System Access `AsBlob()` security check skipped

Upstream now re-checks sensitive paths in
`FileSystemAccessFileHandleImpl::AsBlob()` (a handle can be swapped for a
symlink to a sensitive path), but only when
`kFileSystemAccessDirectoryIterationBlocklistCheck` is on
([a93b504228a53](https://chromium.googlesource.com/chromium/src/+/a93b504228a53)).
Brave has shipped that flag disabled since 2023, so it opts out of the fix.
Local FSA is off unless `kFileSystemAccessAPI` is enabled.

- [ ] Security team: re-evaluate the override in
      `rewrite/content/browser/file_system_access/features.cc.yaml:7`, and
      likely drop it (with its `base/compile_overridden_features.inc:70` entry)

### iOS: new multiwindow provider missing from `brave_providers`

`scene_delegate.mm` now calls `ios::provider::IsWindowSceneActivationAllowed()`,
and upstream added `chromium_multiwindow` to its providers list
([9926f1ac83b16](https://chromium.googlesource.com/chromium/src/+/9926f1ac83b16)).
Brave's copy of that list lacks it, so the app likely fails to link. Brave
needed the same fix in cr154 and cr155.

- [ ] `ios/browser/providers/BUILD.gn:40`: add
      `"//ios/chrome/browser/providers/multiwindow:chromium_multiwindow"`

### Android sync settings show "Search AI Mode and connected apps"

Upstream added a `search_ai_mode_connected_apps` row to the account settings,
which opens myactivity.google.com
([c7cdb801abca5](https://chromium.googlesource.com/chromium/src/+/c7cdb801abca5)).
`BraveManageSyncSettings` removes Google-only rows by key, and doesn't know this
one. Its string was also rebranded to "Brave Workspace apps, like Google Drive".

- [ ] `android/java/org/chromium/chrome/browser/sync/settings/BraveManageSyncSettings.java:102`:
      `removePreferenceByKey(PREF_SEARCH_AI_MODE_CONNECTED_APPS)`

### Vertical tab strip announces stale tab positions

Upstream now updates each tab's accessible position at the end of `Layout()`
instead of on every change
([93d4870030666](https://chromium.googlesource.com/chromium/src/+/93d4870030666),
[f5af3a6317907](https://chromium.googlesource.com/chromium/src/+/f5af3a6317907)).
`BraveTabContainer::Layout()` returns early in scroll mode when its size hasn't
changed. Once the strip overflows its size stays fixed, so screen readers keep
announcing an outdated "tab X of N".

- [ ] `browser/ui/views/tabs/brave_tab_container.cc:738` and `:743`: call
      `UpdateAccessibleTabIndicesIfNeeded()` on both early returns

### Pre-existing: Polymer overrides of elements that became Lit before cr156

These elements went Lit in earlier lifts, so their Polymer overrides do nothing.
`polymer_overriding.ts` doesn't report it.

- [ ] `browser/resources/settings/br/sync_controls.ts:13`: the AI Chat sync
      toggle (`kBraveSyncAIChat`) is never injected, and the payments toggle
      isn't removed (Lit since
      [6133554291740](https://chromium.googlesource.com/chromium/src/+/6133554291740))
- [ ] `browser/resources/settings/br/performance_page.ts:9`:
      `#discardRingTreatmentToggleButton` is no longer removed (Lit since
      [7e42745b4fec1](https://chromium.googlesource.com/chromium/src/+/7e42745b4fec1))
- [ ] `browser/resources/settings/br/edit_dictionary_page.ts:9`: style override
      (Lit since
      [e5e2d063e35df](https://chromium.googlesource.com/chromium/src/+/e5e2d063e35df))
- [ ] `browser/resources/settings/br/reset_profile_dialog.ts:11`:
      `#sendSettings` is no longer hidden and unchecked. The upload itself stays
      blocked by
      `patches/chrome-browser-profile_resetter-reset_report_uploader.cc.patch`.
      (Lit since
      [cb3ba35217a6c](https://chromium.googlesource.com/chromium/src/+/cb3ba35217a6c))
- [ ] `chromium_src/chrome/browser/resources/side_panel/bookmarks/power_bookmarks_list.ts:41`:
      the refresh after moving a bookmark in custom order never runs (Lit since
      [a1ded79ae4558](https://chromium.googlesource.com/chromium/src/+/a1ded79ae4558))
- [ ] `ui/webui/resources/polymer_overriding.ts`: log an error, and fail tests,
      when an element with registered modifications isn't a Polymer element

### Pre-existing: close-window warning stops after a cancelled quit

`chromium_src/chrome/browser/lifetime/browser_close_manager.cc` renames
`CancelBrowserClose` to `CancelBrowserClose_ChromiumImpl`. Upstream only calls
that private method from inside the same file, so the renamed calls skip Brave's
wrapper, and `g_browser_closing_started` stays set after the user cancels a
quit. From then on `BraveBrowser::ShouldAskForBrowserClosingBeforeHandlers()`
(`browser/ui/brave_browser.cc:188`) never warns again in that session.

- [ ] Replace both `_ChromiumImpl` renames with plaster `preempt_function_impl`
      on `StartClosingBrowsers` and `CancelBrowserClose`, as
      `rewrite/chrome/browser/ui/unload_controller.cc.yaml` does

### Pre-existing: Android reader mode prompt on regular tabs

`TabImpl.isCustomTab()` now asks the tab's delegate factory instead of the
activity
([fbcb497d5ad4f](https://chromium.googlesource.com/chromium/src/+/fbcb497d5ad4f),
M153), so `BraveActivity.spoofCustomTab()` no longer affects
`ReaderModeManager.shouldUseReaderModeMessages()`.

- [ ] `android/java/org/chromium/chrome/browser/dom_distiller/BraveReaderModeManager.java:41`:
      redirect `shouldUseReaderModeMessages()` with `changeMethodOwner`, or drop
      the feature and `BraveActivity.java:3060`

### Pre-existing: iOS WebUI not cleared when leaving a WebUI page

Upstream clears `web_ui_` when a navigation fails or leaves WebUI
([b21788e67d345](https://chromium.googlesource.com/chromium/src/+/b21788e67d345)),
but Brave keeps WebUIs per frame in `web_uis_`, so they are never cleared.

- [ ] `rewrite/ios/web/web_state/web_state_impl_realized_web_state.mm.yaml`:
      make the check in `OnNavigationFinished` test `web_uis_`

## 2. Upcoming deprecations

### V8 `Data()` → `DataV2()`

`FunctionCallbackInfo::Data()` and `PropertyCallbackInfo::Data()` are
`V8_DEPRECATE_SOON`
([2e0984c6ecef8](https://chromium.googlesource.com/chromium/src/+/2e0984c6ecef8)).
Replace `info.Data()` with `info.DataV2().As<v8::Value>()`.

- [x] `components/brave_wallet/renderer/js_polkadot_provider.cc:34`
- [x] `components/brave_wallet/renderer/js_polkadot_provider.cc:41`

### `raw_ptr` in templated containers

An upcoming clang-plugin update will ban raw `T*` elements in container fields
([69c8260425652](https://chromium.googlesource.com/chromium/src/+/69c8260425652),
go/miracleptr-in-containers). Use `raw_ptr<T>` for the elements. The list below
comes from a heuristic grep, so the plugin may report more.

- [x] `browser/tor/tor_profile_manager.h` `tor_profiles_`
- [x] `browser/ephemeral_storage/application_state_observer.h` `observers_`
- [x] `browser/containers/containers_service_delegate_unittest.cc` `observers_`
- [x] `browser/ui/views/playlist/selectable_list_view.h` `child_views_`
- [x] `browser/ui/views/playlist/selectable_list_view.h` `selected_views_`
- [x] `browser/ui/views/tabs/brave_tab_container.h` `closing_tabs_`
- [x] `browser/ui/views/tabs/tab_style_views_unittest.cc` `split_tabs_`
- [x] `browser/ui/tabs/shared_pinned_tab_service.cc` `dummy_contentses_`
- [x] `browser/ui/tabs/shared_pinned_tab_service.h` `browsers_`
- [x] `browser/ui/tabs/shared_pinned_tab_service.h` `closing_browsers_`
- [x] `browser/ui/tabs/shared_pinned_tab_service.h` `in_tab_dragging_browsers_`
- [x] `browser/permissions/mock_permission_lifetime_prompt_factory.h` `prompts_`
- [x] `chromium_src/components/search_engines/brave_template_url_prepopulate_data_unittest.cc`
      `brave_prepopulated_engines_` (`RAW_PTR_EXCLUSION`: static data exposed as
      a span of raw pointers)
- [x] `components/brave_wallet/browser/json_rpc_service_unittest.cc`
      `eth_call_handlers_`
- [x] `components/brave_wallet/browser/json_rpc_service_unittest.cc`
      `sol_rpc_call_handlers_`
- [x] `components/brave_shields/core/browser/ad_block_filters_provider_manager.h`
      `default_engine_filters_providers_`
- [x] `components/brave_shields/core/browser/ad_block_filters_provider_manager.h`
      `additional_engine_filters_providers_`
- [x] `components/ai_chat/core/browser/associated_content_manager.h`
      `content_delegates_`

### `raw_ptr` checks coming to Blink core

A new plugin flag stops exempting `third_party/blink/renderer/core/`
([e288df60a9cce](https://chromium.googlesource.com/chromium/src/+/e288df60a9cce)).
It's off for now; turning it on is a planned follow-up. Paths match by
substring, so Brave's page graph is covered too. It has 25 raw `T*` fields.

- [ ] `third_party/blink/renderer/core/brave_page_graph/**`: `raw_ptr<T>` for
      non-GC pointees and `Member<>` for Oilpan ones, e.g. `page_graph.h:525`,
      `graph_item/edge/graph_edge.h:53` and `requests/tracked_request.h:24`

### iOS `web::ScriptMessage::legacy_body()`

`legacy_body()` and the `std::unique_ptr<base::Value>` constructor are
deprecated in favour of `ScriptMessageValue` and `body()` (crbug.com/514993435)
([c2614ce5b6e13](https://chromium.googlesource.com/chromium/src/+/c2614ce5b6e13)).
Calling `body()` on a message built with the legacy constructor CHECK-fails, so
migrate the constructors first. Example:
[6bfd6d0a49ece](https://chromium.googlesource.com/chromium/src/+/6bfd6d0a49ece).

- [ ] Legacy constructor: `ios/web/js_messaging/prompt_facade.mm:91`,
      `ios/browser/api/favicon/favicon_driver.mm:142`
- [ ] `ios/browser/api/favicon/favicon_driver.mm:148`, `:156`
- [ ] `ios/browser/brave_ads/ads_media_reporting_javascript_feature.mm:53`
- [ ] `ios/browser/brave_search/brave_search_make_default_javascript_feature.mm:74`
- [ ] `ios/browser/brave_shields/protection_stats_javascript_feature.mm:56`
- [ ] `ios/browser/brave_shields/request_blocking/request_blocking_javascript_feature.mm:71`
- [ ] `ios/browser/brave_talk/brave_talk_launcher_javascript_feature.mm:63`
- [ ] `ios/browser/playlist/playlist_javascript_feature.mm:125`
- [ ] `ios/browser/skus/skus_javascript_feature.mm:167`
- [ ] `ios/browser/web/de_amp/de_amp_javascript_feature.mm:102`
- [ ] `ios/browser/web/document_fetch/document_fetch_javascript_feature.mm:76`
- [ ] `ios/browser/web/logins/logins_javascript_feature.mm:63`
- [ ] `ios/web/js_messaging/message_handler_token.mm:24`
- [ ] `ios/web/js_messaging/prompt_facade_unittest.mm:56`, `:206`

### `base::NotFatalUntil::M138`

Upstream is deleting old `NotFatalUntil` values with
`base/tools/clean-up-not-fatal-until.py`, and plans the next batch for November
([2f77edf82ed8a](https://chromium.googlesource.com/chromium/src/+/2f77edf82ed8a)).

- [ ] `components/brave_wallet/browser/network_manager.cc:120`: delete the
      `DumpWithoutCrashing` block gated on M138, dead since M139
      (brave-browser#46940)

### Key pinning split from the HSTS preload list

Pins now build under `chrome_key_pinning_supported` /
`BUILDFLAG(CHROME_KEY_PINNING_SUPPORTED)`
([98c94f7896663](https://chromium.googlesource.com/chromium/src/+/98c94f7896663),
[7c21bfc34ced1](https://chromium.googlesource.com/chromium/src/+/7c21bfc34ced1)).
Both flags default to `!is_cronet_build` today, but a TODO in `net/features.gni`
plans to turn pinning off on iOS, where Brave relies on it.

- [ ] `ios/browser/api/net/BUILD.gn:23`: depend on
      `//net/http:generate_transport_security_state_pins`
- [ ] `ios/browser/api/net/certificate_utility.mm:43`,
      `ios/testing/certificate_unittest.mm:19`,
      `net/http/brave_cert_pinning_test.cc:45` and
      `chromium_src/net/http/transport_security_state.cc:18`: check
      `CHROME_KEY_PINNING_SUPPORTED`
- [ ] When upstream changes the iOS default, set `chrome_key_pinning_supported`
      for Brave iOS

### Flag-gated replacement UIs bypass Brave's overrides

Upstream is building replacements for UIs Brave customizes, behind flags that
are off at 157 but some of which are exposed in about:flags:

- `kAppMenuGlowUp`: `ActionAppMenu`
  ([e406acf9fec52](https://chromium.googlesource.com/chromium/src/+/e406acf9fec52))
  never creates an `AppMenuModel`, so `BraveAppMenuModel` never runs.
- `kWebUIToolbar` and `kWebUIAppMenuButton` construct the plain `AppMenuModel`.
- `kWebUIOmniboxFullPopup`
  ([842c093c08bc6](https://chromium.googlesource.com/chromium/src/+/842c093c08bc6))
  skips Brave's omnibox popup overrides.
- `kWebUILocationBar`, `kWebUIAvatarButton` and `kWebium` replace views Brave
  subclasses.

Brave only pins the two WebUI omnibox flags.

- [ ] Ship these flags disabled with `set_feature_flag_default_state`, and list
      them in `app/feature_defaults_unittest.cc`
- [ ] `browser/ui/views/toolbar/brave_toolbar_view.cc:234`: the comment says
      `kWebUILocationBar` is force-disabled, but nothing overrides it
- [ ] When porting: express Brave's menu items as browser actions

### Android settings in a tab bypass Brave's settings substitutions

Upstream enabled `SettingsInTabUrlNav`
([dc6d4c6952f2d](https://chromium.googlesource.com/chromium/src/+/dc6d4c6952f2d)).
When settings are tab-hosted (`kSettingsInTabDesktop`, on for desktop Android),
navigation goes through `chrome://settings/<route>` and
`SettingsFragmentRegistry`. That skips `BraveSettingsLauncherImpl`, where Brave
swaps in its fragments (downloads, clear browsing data, safe browsing, tabs),
and Brave's XML replacements. Phones and tablets are not affected
(`kSettingsInTab` is off).

- [ ] `android/java/org/chromium/chrome/browser/settings/BraveSettingsLauncherImpl.java:48`:
      don't force `BraveSettingsActivity` on intents built for a settings tab,
      as `BraveSettingsIntentUtil` already avoids
- [ ] Map upstream routes to Brave's fragments (`SettingsFragmentRegistry`
      plaster), or ship `kSettingsInTabDesktop` disabled
- [ ] Use `startSettings()` instead of `createSettingsIntent()` +
      `startActivity()`, as in
      [c6cbdc69975ef](https://chromium.googlesource.com/chromium/src/+/c6cbdc69975ef):
  - [ ] `android/java/org/chromium/chrome/browser/shields/ContentFilteringFragment.java:152`,
        `:178`
  - [ ] `android/java/org/chromium/chrome/browser/settings/BraveWalletNetworksPreferenceFragment.java:152`
  - [ ] `android/java/org/chromium/chrome/browser/crypto_wallet/activities/NetworkSelectorActivity.java:145`
  - [ ] `browser/password_manager/android/java/src/org/chromium/chrome/browser/password_manager/BravePasswordManagerHelper.java:58`

## 3. Code-health migrations

### TabHelpers → TabFeatures

`chrome/browser/ui/tab_helpers.h` now says not to use `TabHelpers` on desktop,
and to prefer `TabFeatures` on Android. Upstream's `TabHelpers` creations fell
from 111 at 155 to 45 at 157, e.g.
[771fe024274f4](https://chromium.googlesource.com/chromium/src/+/771fe024274f4)
(desktop and Android) and
[50e8515cf41eb](https://chromium.googlesource.com/chromium/src/+/50e8515cf41eb).
The idiom:

- Drop `WebContentsUserData`. Add `DECLARE_USER_DATA(T)`, a
  `ui::ScopedUnownedUserData<T>` member, a `(tabs::TabInterface&, WebContents*)`
  constructor and `static T* From(tabs::TabInterface*)`.
- Desktop: create it in `BraveTabFeatures::Init()` with
  `GetUserDataFactory().CreateInstance<T>(tab, tab, tab.GetContents())`. Desktop
  `TabFeatures` outlive a discard, so the helper must follow the new contents:
  derive it from `tabs::ContentsObservingTabFeature`, as Brave already does for
  `ContainerTabTracker`.
- Android: create it in the `BraveTabFeatures` constructor; `TabFeatures` are
  rebuilt per `WebContents`.
- Callers: `T::From(tabs::TabInterface::MaybeGetFromContents(web_contents))`.

Brave already has `BraveTabFeatures` on desktop
(`browser/ui/tabs/brave_tab_features.cc`) and Android
(`browser/android/brave_tab_features.cc`). Move the helpers created in
`browser/brave_tab_helpers.cc`:

- [ ] `YouTubeScriptInjectorTabHelper`
- [ ] `brave_shields::BraveShieldsTabHelper`
- [ ] `BraveGeolocationPermissionTabHelper`
- [ ] `BackgroundColorTabHelper`
- [ ] `brave_rewards::RewardsTabHelper`
- [ ] `ai_chat::AIChatTabHelper`
- [ ] `BraveDrmTabHelper`
- [ ] `BraveWaybackMachineTabHelper`
- [ ] `brave_perf_predictor::PerfPredictorTabHelper`
- [ ] `serp_metrics::SerpMetricsTabHelper`
- [ ] `brave_ads::AdsTabHelper`
- [ ] `brave_ads::CreativeSearchResultAdTabHelper`
- [ ] `web_discovery::WebDiscoveryTabHelper`
- [ ] `speedreader::SpeedreaderTabHelper`
- [ ] `tor::TorTabHelper`
- [ ] `tor::OnionLocationTabHelper`
- [ ] `BraveNewsTabHelper`
- [ ] `OnboardingTabHelper`
- [ ] `sidebar::SidebarTabHelper`
- [ ] `brave_wallet::BraveWalletTabHelper`
- [ ] `misc_metrics::PageMetricsTabHelper`
- [ ] `RequestOTRTabHelper`
- [ ] `playlist::PlaylistTabHelper`
- [x] `content_settings::PageSpecificContentSettings`: skipped, it's upstream's
      own class and upstream `TabHelpers` still creates it
- [x] `brave_shields::BraveShieldsWebContentsObserver`: skipped, it's also
      attached to non-tab `WebContents` (AI Chat, offliner, presentation
      receiver, backup search results)
- [x] `ephemeral_storage::EphemeralStorageTabHelper`: skipped, same reason
- [ ] `browser/ui/tabs/brave_tab_features.cc:94` and `:98`: make
      `TabDataWebContentsObserver` and `WebMcpInjector` follow discards
      (`ContentsObservingTabFeature`); they keep observing the old `WebContents`

### `crypto/sha2.h` and `crypto/secure_hash.h` → `crypto/hash.h`

Both headers are deprecated and being removed (crbug.com/374310081). Upstream
example: [ecdf557d](https://chromium.googlesource.com/chromium/src/+/ecdf557d),
which replaces `crypto::kSHA256Length` with `crypto::hash::kSha256Size`.

- [x] `browser/extensions/brave_crx_generation_browsertest.cc`
- [x] `components/brave_component_updater/browser/brave_component_installer.cc`
- [x] `components/brave_rewards/core/engine/hash_prefix_store.cc`
- [x] `components/brave_rewards/core/engine/hash_prefix_store_unittest.cc`
- [x] `components/brave_rewards/core/engine/publisher/prefix_util.cc`
- [x] `components/brave_rewards/core/engine/util/random_util.cc`
- [x] `components/brave_rewards/core/engine/util/request_signer.cc`
- [x] `components/brave_rewards/core/engine/wallet_provider/bitflyer/connect_bitflyer_wallet.cc`
- [x] `components/brave_service_keys/brave_service_key_utils.cc`
- [x] `components/brave_shields/content/browser/ad_block_subscription_service_manager.cc`
- [x] `components/brave_shields/core/browser/ad_block_component_installer.cc`
- [x] `components/brave_wallet/browser/wallet_data_files_installer.cc`
- [x] `components/local_ai/core/local_models_updater.cc`
- [x] `components/local_ai/core/on_device_speech_models_component_installer.cc`
- [x] `components/ntp_background_images/browser/ntp_background_images_component_installer.h`
- [x] `components/ntp_background_images/browser/sponsored_content/ntp_sponsored_images_component_installer.h`
- [x] `components/p3a/nitro_utils/cose.cc`
- [x] `components/playlist/content/browser/media_detector_component_installer.cc`
- [x] `components/psst/core/browser/psst_component_installer.cc`
- [x] `components/speedreader/speedreader_rewriter_service.cc`
- [x] `components/web_discovery/browser/background_credential_helper.cc`
- [x] `components/web_discovery/browser/ecdh_aes.cc`
- [x] `components/web_discovery/browser/reporter.cc`
- [x] `components/web_discovery/browser/signature_basename.cc`
- [x] `components/web_discovery/browser/signature_basename_unittest.cc`
- [x] `components/web_mcp/core/browser/web_mcp_component_installer.cc`
- [x] `ios/browser/api/certificate/models/brave_certificate_fingerprint.mm`
- [x] `net/http/partitioned_host_state_map.cc`
- [x] `net/http/partitioned_host_state_map.h`
- [x] `net/http/partitioned_host_state_map_unittest.cc`

### Globals with exit-time destructors

Upstream keeps replacing non-trivial globals (e.g. `std::string` constants) with
trivially destructible ones, and removed the warning opt-out from 103 more
directories in this range
([f441240bbd533](https://chromium.googlesource.com/chromium/src/+/f441240bbd533)).
In Brave the remaining debt is its `[[clang::no_destroy]]` globals. The idioms
are `constexpr char[]` or `std::array<const char*>` for strings
([5f306ea932644](https://chromium.googlesource.com/chromium/src/+/5f306ea932644)),
constexpr `base::MakeFixedFlatMap` for maps
([982b66c8dad34](https://chromium.googlesource.com/chromium/src/+/982b66c8dad34)),
`static constexpr re2::LazyRE2` for patterns
([a8341bafd1de1](https://chromium.googlesource.com/chromium/src/+/a8341bafd1de1)),
and a function-local `base::NoDestructor` otherwise.

- [x] `components/tor/tor_control_event.h`: `kTorControlEventByName` → constexpr
      `base::fixed_flat_map`; `kTorControlEventByEnum` → `operator<<` for
      `TorControlEvent` (used via `base::ToString`)
- [ ] Constant tables:
  - [ ] `components/brave_perf_predictor/browser/bandwidth_linreg_parameters.h:264`,
        `:485`, `:682`, `:694` (in a header, so one static initializer per
        includer)
  - [ ] `components/brave_private_cdn/headers.h:19`
  - [ ] `components/brave_wallet/browser/solana_instruction_builder.h:70`
  - [ ] `components/brave_rewards/core/engine/endpoints/common/post_create_transaction.h:35`
  - [ ] `components/brave_news/browser/feed_building.cc:48`, `:68`
  - [ ] `components/ntp_tiles/brave_popular_sites_impl.cc:15`
  - [ ] `build/ios/mojom/cpp_transformations.h:21`, `:43`
- [ ] RE2 patterns: `components/brave_news/browser/html_parsing.cc:57`, `:68`,
      `:85`, `:103`
- [ ] Function-local statics:
  - [ ] `components/brave_rewards/content/rewards_protocol_navigation_throttle.cc:128`
  - [ ] `components/brave_rewards/content/rewards_service_impl.cc:529`, `:557`
  - [ ] `components/brave_rewards/core/engine/util/rewards_prefs.cc:78`
  - [ ] `components/brave_wallet/browser/bitcoin/bitcoin_serializer.cc:39`,
        `:63`, `:76`
  - [ ] `browser/ui/views/brave_help_bubble/brave_help_bubble_host_view.cc:49`
  - [ ] `browser/ui/views/brave_tooltips/brave_tooltip_popup_handler.cc:21`
- [ ] Test-override globals (use a function-local `base::NoDestructor`
      accessor):
  - [ ] `browser/extensions/api/identity/brave_web_auth_flow.cc:36`
  - [ ] `components/brave_wallet/browser/asset_ratio_service.cc:139`
  - [ ] `components/brave_wallet/browser/wallet_data_files_installer.cc:55`
  - [ ] `components/brave_search/browser/brave_search_fallback_host.cc:19`
  - [ ] `components/brave_referrals/browser/brave_referrals_service.cc:87`
- [ ] Tests:
  - [ ] `app/brave_main_delegate_browsertest.cc:61`
  - [ ] `components/l10n/common/ofac_sanction_util_unittest.cc:34`
  - [ ] `components/brave_shields/content/test/csp_merge_unittest.cc:20`, `:26`
  - [ ] `components/ntp_background_images/browser/view_counter_model_unittest.cc:28`
  - [ ] `components/brave_wallet/browser/blockchain_registry_unittest.cc:231`,
        `:255`, `:279`, `:304`

### Feature getters → `UnownedUserData`

Upstream removed every public getter from `BrowserWindowFeatures`, and both it
and `TabFeatures` now say "Do not add more public accessors"
(crbug.com/481268779)
([99f9595406318](https://chromium.googlesource.com/chromium/src/+/99f9595406318),
[6126eaab5a9f6](https://chromium.googlesource.com/chromium/src/+/6126eaab5a9f6),
[ffd23d0098426](https://chromium.googlesource.com/chromium/src/+/ffd23d0098426)).
Add `DECLARE_USER_DATA`, a `ScopedUnownedUserData` member and a static
`From(BrowserWindowInterface*)` or `From(tabs::TabInterface*)`, then delete the
getter. Brave already does this for 12 classes, e.g. `BraveVPNController`.

- [ ] `browser/ui/browser_window/public/browser_window_features.h:59`
      `sidebar_controller()` (34 call sites in 22 files)
- [ ] `browser/ui/browser_window/public/browser_window_features.h:63`, `:67`
      `focus_mode_controller()` (42 call sites in 14 files)
- [ ] `browser/ui/tabs/public/brave_tab_features.h:80`, `:83`, `:90`, `:97`,
      `:104`, `:111`, `:118`, `:125`: PSST, partitioned storage, Speedreader,
      Wayback, Playlist, onion location and Brave News getters, reached through
      `BraveTabFeatures::FromTabFeatures()`

### NullAway: Brave Java without `@NullMarked`

Upstream keeps annotating its classes, e.g. `ChromeActivity` and
`ChromeTabbedActivity`
([3223b5d0026a1](https://chromium.googlesource.com/chromium/src/+/3223b5d0026a1),
[38373c2e8ddf0](https://chromium.googlesource.com/chromium/src/+/38373c2e8ddf0)).
421 of 704 Brave production Java files have no `@NullMarked`, against 47 of 1495
upstream in `chrome/android/java/src`. 90 Brave subclasses are unannotated while
their parent is `@NullMarked`, so their overrides aren't checked. Presubmit only
forces the annotation on new files. List the files with
`git ls-files '*.java' | grep -vE '/(javatests|junit|test)/|Test\.java$|build/android/bytecode' | xargs grep -L '@NullMarked'`.

- [ ] `@NullMarked` files that still use androidx `@Nullable`/`@NonNull`, which
      can't annotate type arguments (what broke in the rebase fix for
      `@Nullable` suppliers). Switch to `org.chromium.build.annotations`:
  - [ ] `android/java/org/chromium/base/BraveCommandLineInitUtil.java`
  - [ ] `android/java/org/chromium/chrome/browser/crypto_wallet/util/WalletUtils.java`
  - [ ] `android/java/org/chromium/chrome/browser/crypto_wallet/util/AndroidUtils.java`
  - [ ] `android/java/org/chromium/chrome/browser/firstrun/WelcomeOnboardingActivity.java`
  - [ ] `android/java/org/chromium/chrome/browser/homepage/settings/BraveRadioButtonGroupHomepagePreference.java`
  - [ ] `android/java/org/chromium/chrome/browser/homepage/settings/BraveRadioButtonGroupHomepagePreferenceDummySuper.java`
  - [ ] `android/java/org/chromium/chrome/browser/media/BraveYouTubePictureInPictureController.java`
  - [ ] `android/java/org/chromium/chrome/browser/omnibox/suggestions/BraveAutocompleteMediator.java`
  - [ ] `android/java/org/chromium/chrome/browser/settings/BraveShredPreference.java`
  - [ ] `android/java/org/chromium/chrome/browser/settings/BraveShredPreferencesFragment.java`
  - [ ] `android/java/org/chromium/chrome/browser/tabbed_mode/BraveTabbedAppMenuPropertiesDelegate.java`
  - [ ] `android/java/org/chromium/chrome/browser/ui/BraveAdaptiveToolbarUiCoordinator.java`
  - [ ] `android/java/org/chromium/chrome/browser/vpn/adapters/AlwaysOnPagerAdapter.java`
  - [ ] `browser/customize_menu/android/java/src/org/chromium/brave/browser/customize_menu/CustomizeBraveMenu.java`
  - [ ] `browser/password_manager/android/test_support/java/src/org/chromium/chrome/browser/password_manager/FakePasswordManagerHandler.java`
- [ ] Annotate the unannotated subclasses of `@NullMarked` parents, starting
      with `BraveActivity`

## 4. Obsolete Brave code

### Fledge and AdInterestGroupAPI overrides

Upstream disabled both by default
([7270d1697cac1](https://chromium.googlesource.com/chromium/src/+/7270d1697cac1)),
so Brave's overrides now match upstream. Keep the origin-trial block, since
AdInterestGroupAPI still has a trial name.

- [ ] `rewrite/third_party/blink/renderer/platform/runtime_enabled_features.json5.yaml:68`,
      `:108`, and `EnableFledge(false)` in
      `renderer/brave_content_renderer_client.cc:126`, or keep them deliberately
      as pins (keep the tests either way)

### Leftover `prefs` binding on the Brave Origin page

The page is Lit now and has no `prefs` property.

- [ ] `browser/resources/settings/br/settings_main.ts:84`: drop
      `prefs="{{prefs}}"`

### Widevine headers dep added twice

Upstream added the `//third_party/widevine/cdm:headers` dep to
`//chrome/common:unit_tests`
([c57c951e07bda](https://chromium.googlesource.com/chromium/src/+/c57c951e07bda))
a day before Brave's plaster for it landed, so the generated patch now adds a
second identical line.

- [ ] `rewrite/chrome/common/BUILD.gn.yaml:48`: drop the substitution and
      regenerate the patch

### Test filters that stopped matching

- [ ] `test/filters/unit_tests.filter:344-346`: upstream parameterised
      `EnclaveAuthenticatorRequestDelegateTest`
      ([8f0c99f9f2b21](https://chromium.googlesource.com/chromium/src/+/8f0c99f9f2b21)),
      and an exact negative filter doesn't match `All/…/0`, so these tests run
      again. Use
      `-All/EnclaveAuthenticatorRequestDelegateTest.BrowserProvidedPasskeysAvailable*/*`
- [ ] `browser_tests.filter:74`:
      `WebUIToolbarWebViewBrowserTest.DropSearchTextOnToolbar` became
      `WebUIToolbarDropBrowserTest.DropPlainText_FromWebPage` and
      `.DropPlainText_FromOs`
      ([42e274290139a](https://chromium.googlesource.com/chromium/src/+/42e274290139a)),
      which still expect a Google search. Use
      `-WebUIToolbarDropBrowserTest.DropPlainText_*`
- [ ] `browser_tests.filter:2204-2205`: delete; the renamed tests are already
      filtered at `:2206-2208`
      ([28516df78f9e7](https://chromium.googlesource.com/chromium/src/+/28516df78f9e7))

### Pre-existing: stale overrides

- [ ] Polymer overrides of elements that no longer exist upstream:
      `browser/resources/settings/br/basic_page.ts:52`,
      `br/settings_basic_page.ts:10`, `br/printing_page.ts:9`,
      `br/autofill_section.ts:11`, and `br/passwords_section.ts:9`
      (`#checkPasswordsLinkRow` is gone)
- [ ] `browser/resources/settings/br/settings_ui.ts:146`: listens for
      `showing-section`, which upstream no longer dispatches
- [ ] `browser/resources/settings/br/config.ts:18`:
      `RegisterPolymerComponentToIgnore('settings-search-page')`; the element is
      Lit and has a lit_mangler
- [ ] `base/compile_overridden_features.inc`: `PlusAddressesEnabled`,
      `VerticalTabsLaunch`, `CommerceDeveloper`, `EnableForceDownloadToOneDrive`
      and `ReadIsSubjectToUniversalOptOutCapability` aren't features upstream
- [ ] `chromium_src/third_party/blink/common/features.cc:62`:
      `IsPrerender2Enabled()` has no callers
- [ ] `chromium_src/third_party/blink/common/origin_trials/origin_trials.cc:26`:
      `DeviceAttributes`, `InterestCohortAPI`, `FencedFrames`, `Fledge`,
      `SignedExchangeSubresourcePrefetch` and `SubresourceWebBundles` aren't
      trial names upstream
- [ ] Android bytecode hooks whose targets don't exist upstream, none of them
      covered by `BytecodeTest`:
  - [ ] `build/android/bytecode/java/org/brave/bytecode/BraveBookmarkToolbarClassAdapter.java:20`
        (`mBookmarkModel`)
  - [ ] `build/android/bytecode/java/org/brave/bytecode/BraveBookmarkUtilsClassAdapter.java:31`
        (`isSpecialFolder`)
  - [ ] `build/android/bytecode/java/org/brave/bytecode/BraveToolbarManagerClassAdapter.java:66`
        (`mOverlayPanelVisibilitySupplier`)
  - [ ] `build/android/bytecode/java/org/brave/bytecode/BraveTabbedActivityClassAdapter.java:43`
        (`supportsDynamicColors`)
  - [ ] `build/android/bytecode/java/org/brave/bytecode/BraveToolbarLayoutClassAdapter.java:26`
        (`onHomeButtonUpdate`)
- [ ] `components/cached_flags/android/java/src/org/chromium/components/cached_flags/BraveCachedFlag.java:15`:
      six flag names that no longer exist upstream, and `FeedContainment`, which
      isn't a cached flag
- [ ] Test filter entries that match nothing, from earlier lifts: about 8 exact
      names for tests that are now parameterised (e.g.
      `test/filters/browser_tests.filter:463`), 23 `Prefix/…/0` names for tests
      that no longer are (e.g. `browser_tests.filter:546-549`), and about 200
      for deleted tests, mostly Privacy Sandbox. Verify each one;
      `tools/cr/prune_test_filters.py` lists them from built test binaries
- [ ] `test/filters/browser_tests.filter:866-870` and `:2464-2468`: the comments
      wait for CLs that landed long ago; re-evaluate
      `CookieUseCounterBrowserTest.*`
- [ ] `build/chromium/resources/chrome/app/theme/default_{100,200}_percent/common/save_{address,card,password}{,_dark}.png`:
      upstream deleted the originals
      ([0ba8e41f707d5](https://chromium.googlesource.com/chromium/src/+/0ba8e41f707d5)),
      and `branding.js` still copies them in
- [ ] `chromium_src/chrome/common/url_constants.h` replaces the upstream header
      outright, and still defines constants upstream deleted (e.g.
      `kGoogleChromeURLScheme`, unused)
- [x] Feature overrides that equal upstream's default (40 at all three tags,
      e.g. `kShoppingList`): kept. `rewriters.pyl` allows them as pins against
      upstream sliding back

## 5. Optional

- [x] Evaluate `base::ElapsedNoSleepTimer`
      ([592bab9770f88](https://chromium.googlesource.com/chromium/src/+/592bab9770f88))
      for Brave duration metrics (P3A, ads, rewards) that system sleep currently
      inflates. Skipped: the only candidates are UMA histograms
      (`Brave.ShieldsCNAMEBlocking.TotalResolutionTime`,
      `Brave.ProxyingURLLoader.TotalRequestTime`), which Brave doesn't upload,
      and upstream has no adopters yet. Revisit once upstream uses it.
- [ ] Pin `kPreloadingModerateViewportHeuristics` off next to the eager one, now
      that upstream enables both everywhere
      ([0b4834a209fb2](https://chromium.googlesource.com/chromium/src/+/0b4834a209fb2)).
      Brave's network prediction pref already stops preloading.
- [ ] Skip picture-in-picture while projected to Android Auto, as upstream now
      does
      ([12df1c62a0ef8](https://chromium.googlesource.com/chromium/src/+/12df1c62a0ef8)),
      in Brave's YouTube PiP paths:
      `BraveYouTubeScriptInjectorNativeHelper.java:55`,
      `BraveYouTubePictureInPictureController.java:673` and
      `BraveToolbarLayoutImpl.java:639`.
- [ ] Use `CHECK` where upstream converted the `DCHECK`s next to Brave code
      ([8758e8b9a6e53](https://chromium.googlesource.com/chromium/src/+/8758e8b9a6e53)):
      `chromium_src/chrome/browser/bookmarks/android/bookmark_bridge.cc:125`,
      `:146`, `:193`, `:195`, and
      `rewrite/chrome/browser/component_updater/widevine_cdm_component_installer.cc.yaml:33`.
- [ ] Re-sync `tools/android/checkstyle/brave-style-5.0.xml` with upstream: the
      checkstyle 14.1 roll changed FallThrough's `reliefPattern` from `.*`,
      which silently disabled the check
      ([d9283fc6c6d69](https://chromium.googlesource.com/chromium/src/+/d9283fc6c6d69)).
- [ ] Drop `browser_tests.filter:335`
      `WebAccessibleResourcesBrowserTest.DNRRedirectWithQueryAndRef` after a CI
      run: upstream fixed a race in it
      ([5937afcdd2e43](https://chromium.googlesource.com/chromium/src/+/5937afcdd2e43)).
- [ ] Remove the stale `class Browser;` forward declarations in
      `browser/ui/brave_pages.h:15` and
      `browser/ui/tabs/shared_pinned_tab_service.h:23`.

### 3-argument `BASE_FEATURE` with a redundant name

A presubmit error now rejects `BASE_FEATURE(kFoo, "Foo", ...)`, where the string
repeats the identifier
([c70964f1e8077](https://chromium.googlesource.com/chromium/src/+/c70964f1e8077),
[371696a6da55a](https://chromium.googlesource.com/chromium/src/+/371696a6da55a)).
Use `BASE_FEATURE(kFoo, ...)`. Brave's presubmit inlines upstream's, so the
check applies to lines Brave changes. No redundant uses remain.

- [x] `components/ai_chat/core/common/features.cc:228` `kAIChatDeepResearch`

## For privacy review

- `RTCDiagnosticLogging` shipped as stable. The browser side stays off through
  `kWebRtcEventLogCollectionAllowed`, but the JS surface is exposed.
- `kSmartSelectionServerSuggestions`, `kAutofillShowGmailOtpSuggestions`,
  `kZeroSuggestPrefetchOnPageLoadAndTabSwitch` and `kOnDeviceAiDefaultEnabled`
  (new, disabled).
- `kCrossDeviceSigninFromDesktop` and `kDiceHeaderVersion2` (enabled): sign-in,
  already blocked by Brave's sign-in default.
- `kVmDetectionExperiment` (enabled, Windows UMA),
  `kAndroidSetGoogleAccountInHelp` (enabled), `kExtensionsPinnedByDefault`
  (enabled).
- New IPHs: `kIPHBookmarkBarVisibilityFeature`, `kIPHGlassFrameOptInFeature`,
  `kOmniboxFuseboxUserEd*Iph` (disabled).
