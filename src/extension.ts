import * as vscode from 'vscode';
import { parseDiff } from './diffParser';
import { getFunctions, getFunctionsFromText, classify } from './symbolMapper';

export function activate(context: vscode.ExtensionContext) {
  console.log('Расширение "my-first-extension" активировано');

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
      const paths: string[] = [
        ...new Set<string>(changes.map((c: { uri: vscode.Uri }) => c.uri.fsPath)),
      ];

      output.clear();
      output.show(true);
      output.appendLine(`Изменено файлов: ${paths.length}`);

      for (const path of paths) {
        output.appendLine(`\n${path}`);
        try {
          const diff: string = await repo.diffWithHEAD(path);
          if (!diff) {
            output.appendLine('  diff пустой (возможно, новый неотслеживаемый файл)');
            continue;
          }
          const parsed = parseDiff(diff);
          const uri = vscode.Uri.file(path);

          // Функции текущей версии файла
          const newFuncs = await getFunctions(uri);

          // Функции версии из HEAD: берём текст из git и разбираем его
          let oldFuncs: Awaited<ReturnType<typeof getFunctions>> = [];
          try {
            const oldText: string = await repo.show('HEAD', path);
            const languageId = (await vscode.workspace.openTextDocument(uri)).languageId;
            oldFuncs = await getFunctionsFromText(oldText, languageId, path);
          } catch {
            oldFuncs = []; // файла нет в HEAD, значит, он новый
          }

          output.appendLine(
            `  найдено функций: сейчас ${newFuncs.length}, в HEAD ${oldFuncs.length}`
          );

          const result = classify(oldFuncs, newFuncs, parsed);
          output.appendLine(`  добавлены: ${result.added.join(', ') || '-'}`);
          output.appendLine(`  изменены: ${result.modified.join(', ') || '-'}`);
          output.appendLine(`  удалены: ${result.removed.join(', ') || '-'}`);
          output.appendLine(`  изменённых строк вне функций: ${result.outside}`);
        } catch (e) {
          output.appendLine(`  ошибка: ${e}`);
        }
      }
    }
  );
  context.subscriptions.push(generate);
}

export function deactivate() {
  console.log('Расширение "my-first-extension" деактивировано');
}