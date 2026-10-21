import * as vscode from 'vscode';
import { parseDiff } from './diffParser';
import {
  FuncInfo,
  getFunctions,
  getFunctionsFromText,
  classify,
} from './symbolMapper';
import { FileResult } from './messageBuilder';

// Достаём репозиторий из встроенного Git-расширения.
// silent = true: не показывать ошибки (нужно для фонового обновления панели)
export async function getRepo(silent = false): Promise<any | undefined> {
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (!gitExt) {
    if (!silent) { vscode.window.showErrorMessage('Git-расширение не найдено'); }
    return undefined;
  }
  const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
  const repo = git.getAPI(1).repositories[0];
  if (!repo && !silent) {
    vscode.window.showErrorMessage('Откройте папку с git-репозиторием');
  }
  return repo;
}

// Пути изменённых файлов: если есть staged, берём их, иначе все изменения
export function getChangedPaths(repo: any): string[] {
  const staged = repo.state.indexChanges;
  const source = staged.length > 0 ? staged : repo.state.workingTreeChanges;
  return [
    ...new Set<string>(source.map((c: { uri: vscode.Uri }) => c.uri.fsPath)),
  ];
}

// Анализ одного файла: diff + функции сейчас + функции в HEAD
export async function analyzeFile(repo: any, path: string): Promise<FileResult> {
  const uri = vscode.Uri.file(path);

  let diff = '';
  try {
    diff = await repo.diffWithHEAD(path);
  } catch {
    diff = '';
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