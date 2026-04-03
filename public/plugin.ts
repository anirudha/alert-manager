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
} from '../../../src/core/public';
import { AlarmsPluginSetup, AlarmsPluginStart, AppPluginStartDependencies } from './types';
import { PLUGIN_NAME } from '../common';

export class AlarmsPlugin implements Plugin<AlarmsPluginSetup, AlarmsPluginStart> {
  public setup(core: CoreSetup): AlarmsPluginSetup {
    // Register an application into the side navigation menu
    core.application.register({
      id: 'alertManager',
      title: PLUGIN_NAME,
      order: 250,
      euiIconType: 'bell',
      async mount(params: AppMountParameters) {
        // Load application bundle
        const { renderApp } = await import('./application');
        // Get start services as specified in opensearch_dashboards.json
        const [coreStart, depsStart] = await core.getStartServices();
        // Render the application
        return renderApp(coreStart, depsStart as AppPluginStartDependencies, params);
      },
    });

    // Add to observability nav group for workspace mode
    if (core.chrome.navGroup.getNavGroupEnabled()) {
      core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
        {
          id: 'alertManager',
          category: undefined,
          order: 250,
        },
      ]);
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
