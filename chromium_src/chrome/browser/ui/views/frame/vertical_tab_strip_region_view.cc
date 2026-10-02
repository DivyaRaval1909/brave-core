/* Copyright (c) 2026 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "chrome/browser/ui/views/frame/vertical_tab_strip_region_view.h"

#include "base/feature_list.h"
#include "base/functional/bind.h"
#include "brave/browser/ui/tabs/brave_tab_prefs.h"
#include "brave/browser/ui/views/frame/brave_browser_view.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/tabs/features.h"
#include "chrome/browser/ui/tabs/vertical_tab_strip_state_controller.h"
#include "chrome/browser/ui/views/frame/vertical_tab_strip_region_view.h"
#include "components/prefs/pref_service.h"
#include "ui/compositor/layer.h"
#include "ui/display/screen.h"
#include "ui/gfx/geometry/rect_f.h"

namespace {

bool IsInHotCorner(const gfx::PointF& point_in_screen,
                   BraveBrowserView* brave_browser_view) {
  if (!brave_browser_view) {
    return false;
  }
  gfx::RectF hot_corner(
      brave_browser_view->GetBoundingBoxInScreenForMouseOverHandling());
  constexpr int kHotCornerWidth = 16;
  hot_corner.set_width(kHotCornerWidth);
  return hot_corner.Contains(point_in_screen);
}

// Hides the whole region when it's collapsed in "hide completely" mode, and
// clips descendants to its bounds while that mode is on. Tab favicons and
// buttons don't shrink with the region, so without clipping they'd overflow
// the bounds (e.g. while the width animates) and paint over the web contents.
// The region already paints to a layer in upstream, so only the clipping needs
// to be enabled.
void MaybeUpdateVisibility(
    tabs::VerticalTabStripStateController* state_controller,
    VerticalTabStripRegionView* view) {
  const bool hide_completely =
      state_controller->ShouldHideCompletelyWhenCollapsed();
  if (view->layer()) {
    view->layer()->SetMasksToBounds(hide_completely);
  }
  view->SetVisible(!hide_completely || !state_controller->IsCollapsed());
}

}  // namespace

#include <chrome/browser/ui/views/frame/vertical_tab_strip_region_view.cc>

int VerticalTabStripRegionView::GetCollapsedWidth() const {
  return state_controller_->ShouldHideCompletelyWhenCollapsed()
             ? 0
             : kCollapsedWidth;
}

void VerticalTabStripRegionView::ObserveHideCompletelyPref() {
  PrefService* prefs = browser_view()->GetProfile()->GetPrefs();
  if (!base::FeatureList::IsEnabled(tabs::kBraveVerticalTabHideCompletely) ||
      !prefs->FindPreference(
          brave_tabs::kVerticalTabsHideCompletelyWhenCollapsed)) {
    return;
  }
  hide_completely_pref_registrar_.Init(prefs);
  hide_completely_pref_registrar_.Add(
      brave_tabs::kVerticalTabsHideCompletelyWhenCollapsed,
      base::BindRepeating(
          &VerticalTabStripRegionView::OnHideCompletelyPrefChanged,
          base::Unretained(this)));
  MaybeUpdateVisibility(state_controller_, this);
}

void VerticalTabStripRegionView::OnHideCompletelyPrefChanged() {
  OnExpandOnHoverEnabledChanged(state_controller_->IsExpandOnHoverEnabled());
  MaybeUpdateVisibility(state_controller_, this);
  PreferredSizeChanged();
}

void VerticalTabStripRegionView::HandleMouseMoveEvent(
    const gfx::PointF& point_in_screen) {
  if (!state_controller_->ShouldDisplayVerticalTabs() ||
      !state_controller_->ShouldHideCompletelyWhenCollapsed() ||
      !state_controller_->IsCollapsed()) {
    return;
  }

  UpdateExpandOnHoverState(
      IsInHotCorner(point_in_screen, BraveBrowserView::From(browser_view())));
}

bool VerticalTabStripRegionView::IsMouseInHotCorner() const {
  if (!state_controller_->ShouldHideCompletelyWhenCollapsed()) {
    return false;
  }

  return IsInHotCorner(
      gfx::PointF(display::Screen::Get()->GetCursorScreenPoint()),
      BraveBrowserView::From(browser_view()));
}
