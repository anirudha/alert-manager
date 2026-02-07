import * as vscode from 'vscode';
import { startServer, stopServer } from './server-manager';

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const openCmd = vscode.commands.registerCommand('alertManager.open', async () => {
    const port = await startServer(context);

    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      return;
    }

    panel = vscode.window.createWebviewPanel(
      'alertManager',
      'Alert Manager',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = getWebviewContent(port);

    panel.onDidDispose(() => {
      panel = undefined;
    });
  });

  const stopCmd = vscode.commands.registerCommand('alertManager.stop', () => {
    stopServer();
    if (panel) {
      panel.dispose();
      panel = undefined;
    }
    vscode.window.showInformationMessage('Alert Manager server stopped.');
  });

  context.subscriptions.push(openCmd, stopCmd);
}

export function deactivate() {
  stopServer();
}

function getWebviewContent(port: number): string {
  return `<!DOCTYPE html>
<html lang="en" style="height:100%;margin:0;padding:0;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alert Manager</title>
  <style>
    body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="http://localhost:${port}"></iframe>
</body>
</html>`;
}
