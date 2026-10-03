/* Copyright (c) 2026 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

import { html } from '//resources/lit/v3_0/lit.rollup.js'
import { loadTimeData } from '//resources/js/load_time_data.js'

import { BraveAccountCompactRowElement } from './brave_account_compact_row.js'
import { BraveAccountSettingsStrings } from './brave_components_webui_strings.js'

export function getHtml(this: BraveAccountCompactRowElement) {
  return html` <cr-link-row
    start-icon="social-brave-release-favicon-fullheight-color"
    .label=${loadTimeData.getString(
      BraveAccountSettingsStrings.BRAVE_ACCOUNT_TITLE,
    )}
    @click=${this.navigateToAccountSection}
  >
    <div
      class="description"
      slot="sub-label"
    >
      ${this.truncatedDescription}
    </div>
  </cr-link-row>`
}
