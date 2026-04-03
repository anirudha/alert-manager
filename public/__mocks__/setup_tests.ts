/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from '@testing-library/react';

// OSD uses data-test-subj instead of data-testid
configure({ testIdAttribute: 'data-test-subj' });
