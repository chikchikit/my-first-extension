import * as vscode from 'vscode';
import { parseDiff } from './diffParser';

export function activate(context: vscode.ExtensionContext) {
  console.log('Расширение "my-first-extension" активировано');

  // Вывод результатов в отдельную панель Output
  const output = vscode.window.createOutputChannel('Commit Assistant');
  context.subscriptions.push(output);

  // Команда Hello World (из методички)
  const disposable = vscode.commands.registerCommand(
    'my-first-extension.helloWorld',
    () => {
      vscode.window.showInformationMessage(
        'Привет из моего первого расширения!'
      );
    }
  );
  context.subscriptions.push(disposable);

  // Команда: читает изменённые файлы и строки через Git API
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

      // Файл может быть и в index, и в working tree, поэтому убираем дубли
      const changes = [
        ...repo.state.indexChanges,
        ...repo.state.workingTreeChanges,
      ];
      const paths: string[] = [
        ...new Set<string>(changes.map((c: { uri: vscode.Uri }) => c.uri.fsPath)),
      ];

      output.clear();
      output.show(true);
      output.appendLine(`Изменено файлов: ${paths.length}`);

      for (const path of paths) {
        try {
          // diff файла относительно последнего коммита (HEAD)
          const diff: string = await repo.diffWithHEAD(path);
          if (!diff) {
            output.appendLine(`\n${path}\n  diff пустой (возможно, новый неотслеживаемый файл)`);
            continue;
          }
          const parsed = parseDiff(diff);
          output.appendLine(`\n${path}`);
          output.appendLine(`  добавлены строки: ${parsed.addedLines.join(', ') || '-'}`);
          output.appendLine(`  удалены строки (в старом файле): ${parsed.removedLines.join(', ') || '-'}`);
        } catch (e) {
          output.appendLine(`\n${path}\n  ошибка получения diff: ${e}`);
        }
      }
    }
  );
  context.subscriptions.push(generate);
}

export function deactivate() {
  console.log('Расширение "my-first-extension" деактивировано');
}