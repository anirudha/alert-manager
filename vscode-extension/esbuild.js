const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
}).then(() => {
  console.log('Extension bundled successfully');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
