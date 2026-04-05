#!/usr/bin/env node

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI entry point for @opensearch-project/alert-manager
 *
 * Usage:
 *   npx @opensearch-project/alert-manager
 *   npx @opensearch-project/alert-manager --port 8080
 *   npx @opensearch-project/alert-manager --help
 */

const path = require('path');

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  port: 5603,
  help: false,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' || arg === '-p') {
    options.port = parseInt(args[++i], 10);
  } else if (arg === '--help' || arg === '-h') {
    options.help = true;
  }
}

if (options.help) {
  console.log(`
@opensearch-project/alert-manager - Standalone Alert Manager Service

Usage:
  npx @opensearch-project/alert-manager [options]
  osd-alert-manager [options]

Options:
  -p, --port <port>   Port to run the server on (default: 5603)
  -h, --help          Show this help message

Examples:
  npx @opensearch-project/alert-manager
  osd-alert-manager --port 8080

API Endpoints:
  GET    /api/datasources           List datasources
  GET    /api/alerts                List unified alerts
  GET    /api/rules                 List unified rules
  POST   /api/monitors              Create monitor
  DELETE /api/monitors/:id          Delete monitor
`);
  process.exit(0);
}

// Set port via environment variable
process.env.PORT = options.port.toString();

// Start the server
console.log(`
╔═══════════════════════════════════════════════════════════╗
║       OpenSearch Dashboards - Alert Manager Service        ║
╚═══════════════════════════════════════════════════════════╝
`);

require(path.join(__dirname, '..', 'dist', 'standalone', 'server.js'));
