import * as vscode from 'vscode';
import { FileResult, buildMessage, detectType } from './messageBuilder';
import { getRepo, getChangedPaths, analyzeFile } from './analysis';
import { ChangesTree, Node } from './changesTree';

// Заново анализируем изменения и заполняем дерево
async function refreshTree(repo: any, tree: ChangesTree): Promise<void> {
  const results: FileResult[] = [];
  for (const path of getChangedPaths(repo)) {
    results.push(await analyzeFile(repo, path));
  }
  tree.setResults(results);
}

// Обновляем сообщение в поле Source Control по отмеченным галочкам
function updatePreview(repo: any, tree: ChangesTree): void {
  const selected = tree.getSelected();
  repo.inputBox.value = selected.length > 0 ? buildMessage(selected) : '';
}

// Выбор типа, редактирование и коммит по отмеченным элементам дерева
async function runCommitFlow(
  repo: any,
  tree: ChangesTree,
  output: vscode.OutputChannel
): Promise<void> {
  const selected = tree.getSelected();
  if (selected.length === 0) {
    vscode.window.showInformationMessage('Нет выбранных изменений для коммита');
    return;
  }

  // Предлагаем тип по эвристике, но выбор остаётся за пользователем
  const suggested = detectType(selected);
  const allTypes = ['feat', 'fix', 'refactor', 'docs', 'test', 'style', 'perf', 'chore'];
  const ordered = [suggested, ...allTypes.filter((t) => t !== suggested)];
  const picked = await vscode.window.showQuickPick(
    ordered.map((t) => ({
      label: t,
      description: t === suggested ? 'предложено автоматически' : undefined,
    })),
    { placeHolder: 'Выберите тип коммита' }
  );
  if (!picked) {
    return;
  }

  const message = buildMessage(selected, picked.label);
  repo.inputBox.value = message;

  output.clear();
  output.appendLine('Сформировано сообщение:\n');
  output.appendLine(message);

  await vscode.commands.executeCommand('workbench.view.scm');

  let answer: string | undefined;
  let text = 'Сообщение записано в поле Source Control. Закоммитить?';
  while (true) {
    answer = await vscode.window.showInformationMessage(
      text,
      'Закоммитить',
      'Редактировать',
      'Отмена'
    );
    if (answer !== 'Редактировать') {
      break;
    }
    await vscode.commands.executeCommand('workbench.scm.focus');
    text = 'Отредактируйте сообщение в поле Source Control и нажмите «Закоммитить».';
  }
  if (answer !== 'Закоммитить') {
    return;
  }

  // Берём текст из поля, чтобы учесть ручные правки
  const finalMessage: string = repo.inputBox.value.trim();
  if (!finalMessage) {
    vscode.window.showErrorMessage('Сообщение коммита пустое');
    return;
  }
  try {
    // Если ничего не добавлено через git add, коммитим все изменения
    await repo.commit(finalMessage, { all: repo.state.indexChanges.length === 0 });
    repo.inputBox.value = '';
    await refreshTree(repo, tree);
    vscode.window.showInformationMessage('Коммит создан');
  } catch (e) {
    vscode.window.showErrorMessage(`Не удалось создать коммит: ${e}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Расширение "my-first-extension" активировано');

  const output = vscode.window.createOutputChannel('Commit Assistant');
  context.subscriptions.push(output);

  // Дерево изменений в боковой панели
  const tree = new ChangesTree();
  const view = vscode.window.createTreeView('commitAssistant.changes', {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  context.subscriptions.push(view);

  // Поставили или сняли галочку: обновляем модель и сообщение
  view.onDidChangeCheckboxState(async (e) => {
    for (const [node, state] of e.items as readonly [Node, vscode.TreeItemCheckboxState][]) {
      tree.toggle(node, state === vscode.TreeItemCheckboxState.Checked);
    }
    const repo = await getRepo(true);
    if (repo) { updatePreview(repo, tree); }
  });

  // Когда панель открыли, подтягиваем актуальные изменения
  view.onDidChangeVisibility(async (e) => {
    if (e.visible) {
      const repo = await getRepo(true);
      if (repo) { await refreshTree(repo, tree); }
    }
  });

  // Команда Hello World (из методички)
  context.subscriptions.push(
    vscode.commands.registerCommand('my-first-extension.helloWorld', () => {
      vscode.window.showInformationMessage('Привет из моего первого расширения!');
    })
  );

  // Главная команда (горячая клавиша и кнопка в Source Control):
  // анализирует всё заново и сразу запускает сценарий коммита
  context.subscriptions.push(
    vscode.commands.registerCommand('my-first-extension.generateCommitMessage', async () => {
      const repo = await getRepo();
      if (!repo) { return; }
      await refreshTree(repo, tree);
      await runCommitFlow(repo, tree, output);
    })
  );

  // Кнопка «обновить» в панели
  context.subscriptions.push(
    vscode.commands.registerCommand('my-first-extension.refreshChanges', async () => {
      const repo = await getRepo();
      if (!repo) { return; }
      await refreshTree(repo, tree);
      updatePreview(repo, tree);
    })
  );

  // Кнопка «закоммитить» в панели: использует текущие галочки
  context.subscriptions.push(
    vscode.commands.registerCommand('my-first-extension.commitSelected', async () => {
      const repo = await getRepo();
      if (!repo) { return; }
      await runCommitFlow(repo, tree, output);
    })
  );
}

export function deactivate() {
  console.log('Расширение "my-first-extension" деактивировано');
}