import * as vscode from 'vscode';

// Вызывается при активации расширения
export function activate(context: vscode.ExtensionContext) {
  console.log('Расширение "my-first-extension" активировано');

  // Команда Hello World
  const disposable = vscode.commands.registerCommand(
    'my-first-extension.helloWorld',
    () => {
      vscode.window.showInformationMessage(
        'Привет из моего первого расширения!'
      );
    }
  );
  context.subscriptions.push(disposable);

  // Новая команда: читает изменённые файлы через Git API
  const generate = vscode.commands.registerCommand(
    'my-first-extension.generateCommitMessage',
    async () => {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (!gitExt) {
        vscode.window.showErrorMessage('Git-расширение не найдено');
        return;
      }
      const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
      const api = git.getAPI(1);
      const repo = api.repositories[0];
      if (!repo) {
        vscode.window.showErrorMessage('Откройте папку с git-репозиторием');
        return;
      }

      const changes = [
        ...repo.state.indexChanges,
        ...repo.state.workingTreeChanges,
      ];
      const files = changes.map((c: any) => c.uri.fsPath);
      console.log(files);
      vscode.window.showInformationMessage(`Изменено файлов: ${files.length}`);
    }
  );
  context.subscriptions.push(generate);
}

// Вызывается при деактивации расширения
export function deactivate() {
  console.log('Расширение "my-first-extension" деактивировано');
}