/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  Plugin,
  DEFAULT_NAV_GROUPS,
} from 'opensearch-dashboards/public';
import { AlarmsPluginSetup, AlarmsPluginStart, AppPluginStartDependencies } from './types';
import { PLUGIN_NAME } from '../common/constants';
import { renderApp } from './application';

export class AlarmsPlugin implements Plugin<AlarmsPluginSetup, AlarmsPluginStart> {
  public setup(core: CoreSetup): AlarmsPluginSetup {
    // Register an application into the side navigation menu
    core.application.register({
      id: 'alertManager',
      title: PLUGIN_NAME,
      order: 250,
      euiIconType: 'bell',
      async mount(params: AppMountParameters) {
        const [coreStart, depsStart] = await core.getStartServices();
        return renderApp(coreStart, depsStart as AppPluginStartDependencies, params);
      },
    });

    // Add to observability nav group for workspace mode
    try {
      if (core.chrome?.navGroup?.getNavGroupEnabled()) {
        const obsGroup = (typeof DEFAULT_NAV_GROUPS !== 'undefined' &&
          DEFAULT_NAV_GROUPS?.observability) || { id: 'observability' };
        core.chrome.navGroup.addNavLinksToGroup(obsGroup, [
          { id: 'alertManager', category: undefined, order: 250 },
        ]);
      }
    } catch (_e) {
      /* navGroup API may not be available */
    }

    // Return methods that should be available to other plugins
    return {
      getGreeting() {
        return i18n.translate('alertManager.greetingText', {
          defaultMessage: 'Hello from {name}!',
          values: {
            name: PLUGIN_NAME,
          },
        });
      },
    };
  }

  public start(core: CoreStart): AlarmsPluginStart {
    return {};
  }

  public stop() {}
}
