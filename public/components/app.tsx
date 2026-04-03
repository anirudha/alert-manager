/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD-specific app wrapper — bridges OSD services to the shared AlarmsPage.
 */
import React from 'react';
import { I18nProvider } from '@osd/i18n/react';
import { BrowserRouter as Router } from 'react-router-dom';

import { CoreStart } from '../../../../src/core/public';
import { NavigationPublicPluginStart } from '../../../../src/plugins/navigation/public';

import { PLUGIN_ID } from '../../common';
import { AlarmsPage } from './alarms_page';
import { AlarmsApiClient, HttpClient } from '../services/alarms_client';

interface AlarmsAppDeps {
  basename: string;
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
  navigation: NavigationPublicPluginStart;
}

/** Adapt OSD's HttpServiceBase to our simple HttpClient interface */
function createOsdHttpClient(http: CoreStart['http']): HttpClient {
  return {
    get: <T,>(path: string) => http.get<T>(path),
    post: <T,>(path: string, body?: unknown) =>
      http.post<T>(path, body ? { body: JSON.stringify(body) } : undefined),
    delete: <T,>(path: string) => http.delete<T>(path),
  };
}

export const AlarmsApp = ({ basename, notifications, http, navigation }: AlarmsAppDeps) => {
  const apiClient = new AlarmsApiClient(createOsdHttpClient(http), 'osd');

  return (
    <Router basename={basename}>
      <I18nProvider>
        <>
          <navigation.ui.TopNavMenu
            appName={PLUGIN_ID}
            showSearchBar={false}
            useDefaultBehaviors={true}
          />
          <AlarmsPage apiClient={apiClient} />
        </>
      </I18nProvider>
    </Router>
  );
};
