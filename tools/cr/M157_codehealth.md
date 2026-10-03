# M157 code health follow-ups

Tasks found by reviewing upstream changes in `157.0.8082.1..157.0.8086.1` (2188
commits) for regressions, deprecations and code-health migrations that apply to
Brave. Tick items off as they land.

## 1. Regressions

### Autofill private windows toggle lost its pref binding

Upstream removed `PrefsMixin` and the `prefs` property from
`settings-autofill-page`
([8704780af8d79](https://chromium.googlesource.com/chromium/src/+/8704780af8d79)).
`br/autofill_page.ts` still injects a toggle bound with
`pref="{{prefs.brave.autofill_private_windows}}"`, which now resolves against a
property that no longer exists, so the toggle is not tied to the pref. This
fails silently. Other Brave toggles in Polymer templates use `pref-key` (e.g.
`brave_personalization_options.html`).

- [x] `browser/resources/settings/br/autofill_page.ts:177`: replace `pref` with
      `pref-key="brave.autofill_private_windows"`

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

## 3. Code-health migrations

### TabHelpers → TabFeatures

`chrome/browser/ui/tab_helpers.h` now says not to use `TabHelpers` on desktop,
and to prefer `TabFeatures` on Android. Upstream migrated eight helpers in this
range (e.g.
[50e8515cf41eb](https://chromium.googlesource.com/chromium/src/+/50e8515cf41eb),
[bdcfe03041a32](https://chromium.googlesource.com/chromium/src/+/bdcfe03041a32)).
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
- [ ] `content_settings::PageSpecificContentSettings`
- [ ] `brave_shields::BraveShieldsWebContentsObserver`
- [ ] `ephemeral_storage::EphemeralStorageTabHelper`

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
trivially destructible ones.

- [x] `components/tor/tor_control_event.h`: `kTorControlEventByName` → constexpr
      `base::fixed_flat_map`; `kTorControlEventByEnum` → `operator<<` for
      `TorControlEvent` (used via `base::ToString`)

## 4. Optional

- [x] Evaluate `base::ElapsedNoSleepTimer`
      ([592bab9770f88](https://chromium.googlesource.com/chromium/src/+/592bab9770f88))
      for Brave duration metrics (P3A, ads, rewards) that system sleep currently
      inflates. Skipped: the only candidates are UMA histograms
      (`Brave.ShieldsCNAMEBlocking.TotalResolutionTime`,
      `Brave.ProxyingURLLoader.TotalRequestTime`), which Brave doesn't upload,
      and upstream has no adopters yet. Revisit once upstream uses it.

### 3-argument `BASE_FEATURE` with a redundant name

A presubmit error now rejects `BASE_FEATURE(kFoo, "Foo", ...)`, where the string
repeats the identifier
([c70964f1e8077](https://chromium.googlesource.com/chromium/src/+/c70964f1e8077),
[371696a6da55a](https://chromium.googlesource.com/chromium/src/+/371696a6da55a)).
Use `BASE_FEATURE(kFoo, ...)`. This only affects Brave if its own presubmit
mirrors upstream's check.

- [x] `components/ai_chat/core/common/features.cc:228` `kAIChatDeepResearch`
