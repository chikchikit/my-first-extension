import * as vscode from 'vscode';
import { parseDiff } from './diffParser';
import {
  FuncInfo,
  getFunctions,
  getFunctionsFromText,
  classify,
} from './symbolMapper';
import { FileResult, buildMessage } from './messageBuilder';

// Анализ одного файла: diff + функции сейчас + функции в HEAD
async function analyzeFile(repo: any, path: string): Promise<FileResult> {
  const uri = vscode.Uri.file(path);

  let diff = '';
  try {
    diff = await repo.diffWithHEAD(path);
  } catch {
    diff = ''; // например, новый неотслеживаемый файл
  }
  const parsed = parseDiff(diff);

  let newFuncs: FuncInfo[] = [];
  try {
    newFuncs = await getFunctions(uri);
  } catch {
    newFuncs = [];
  }

  let oldFuncs: FuncInfo[] = [];
  try {
    const oldText: string = await repo.show('HEAD', path);
    const languageId = (await vscode.workspace.openTextDocument(uri)).languageId;
    oldFuncs = await getFunctionsFromText(oldText, languageId, path);
  } catch {
    oldFuncs = []; // файла нет в HEAD, значит, он новый
  }

  const result = classify(oldFuncs, newFuncs, parsed);
  return {
    path: vscode.workspace.asRelativePath(uri, false),
    added: result.added,
    modified: result.modified,
    removed: result.removed,
    outside: result.outside,
  };
}

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

      // Если что-то добавлено через git add, берём только это,
      // иначе все изменения (как и при коммите ниже)
      const staged = repo.state.indexChanges;
      const source = staged.length > 0 ? staged : repo.state.workingTreeChanges;
      const paths: string[] = [
        ...new Set<string>(source.map((c: { uri: vscode.Uri }) => c.uri.fsPath)),
      ];

      if (paths.length === 0) {
        vscode.window.showInformationMessage('Нет изменений для коммита');
        return;
      }

      // Анализируем все файлы
      const results: FileResult[] = [];
      for (const path of paths) {
        results.push(await analyzeFile(repo, path));
      }

      // Собираем сообщение и кладём в поле Source Control
      const message = buildMessage(results);
      repo.inputBox.value = message;

      output.clear();
      output.appendLine('Сформировано сообщение:\n');
      output.appendLine(message);

      // Просим подтверждение. Пока уведомление открыто,
      // сообщение можно править прямо в поле Source Control
      const answer = await vscode.window.showInformationMessage(
        'Сообщение записано в поле Source Control. Можно отредактировать его. Закоммитить?',
        'Закоммитить',
        'Отмена'
      );
      if (answer !== 'Закоммитить') {
        return;
      }

      // Берём текст из поля, а не исходный, чтобы учесть правки
      const finalMessage: string = repo.inputBox.value.trim();
      if (!finalMessage) {
        vscode.window.showErrorMessage('Сообщение коммита пустое');
        return;
      }
      try {
        // Если ничего не добавлено через git add, коммитим все изменения
        await repo.commit(finalMessage, { all: staged.length === 0 });
        repo.inputBox.value = '';
        vscode.window.showInformationMessage('Коммит создан');
      } catch (e) {
        vscode.window.showErrorMessage(`Не удалось создать коммит: ${e}`);
      }
    }
  );
  context.subscriptions.push(generate);
}

export function deactivate() {
  console.log('Расширение "my-first-extension" деактивировано');
}