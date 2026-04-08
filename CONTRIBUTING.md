# Contributing to Alert Manager

Thank you for your interest in contributing to Alert Manager!

## Ways to Contribute

- Report bugs and request features via [GitHub Issues](https://github.com/opensearch-project/dashboards-observability/issues)
- Submit pull requests for bug fixes or new features
- Improve documentation
- Help answer questions in issues

## Development Setup

### Prerequisites

- Node.js 18+
- Yarn 1.22+ (for OSD plugin mode)
- npm 9+ (for standalone mode)

### Standalone Development

```bash
cd standalone
npm install --legacy-peer-deps
npm run dev
```

### OSD Plugin Development

```bash
# From OSD root (requires Node < 23, e.g. nvm use 22)
# With observability stack running in Docker:
yarn start --config config/opensearch_dashboards.dev.yml

# Or without the observability stack (default OSD config):
yarn start
```

See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for the full local development setup.

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit with DCO sign-off (`git commit -s -m "Add amazing feature"`)
6. Push to your fork
7. Open a Pull Request

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Add comments for complex logic
- Keep functions small and focused

## DCO Sign-Off

All commits must be signed off with the Developer Certificate of Origin (DCO):

```bash
git commit -s -m "Your commit message"
```

## Questions?

Open an issue or reach out to the maintainers.
