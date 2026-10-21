import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as nodePath from 'path';
import { ParsedDiff } from './diffParser';

export interface FuncInfo {
  name: string;          // например "area" или "Rectangle.area"
  range: vscode.Range;   // какие строки занимает функция
}

export interface FunctionChanges {
  added: string[];
  modified: string[];
  removed: string[];
  outside: number;       // сколько изменённых строк вне функций
}

// Типы символов, которые мы считаем функциями
const FUNC_KINDS = [
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
];

// Дерево символов (класс -> методы) превращаем в плоский список функций
function flatten(symbols: any[], prefix = '', out: FuncInfo[] = []): FuncInfo[] {
  for (const s of symbols) {
    const name = prefix ? `${prefix}.${s.name}` : s.name;
    if (FUNC_KINDS.includes(s.kind)) {
      // DocumentSymbol хранит range сам, SymbolInformation в location.range
      out.push({ name, range: s.range ?? s.location.range });
    }
    if (s.children && s.children.length > 0) {
      flatten(s.children, name, out);
    }
  }
  return out;
}

// Просим VS Code выдать функции файла
export async function getFunctions(uri: vscode.Uri): Promise<FuncInfo[]> {
  const symbols = await vscode.commands.executeCommand<any[]>(
    'vscode.executeDocumentSymbolProvider',
    uri
  );
  return flatten(symbols ?? []);
}

// Функции из текста (например, версии файла из HEAD)
export async function getFunctionsFromText(
  content: string,
  languageId: string,
  fileName: string
): Promise<FuncInfo[]> {
  // Способ 1: открываем текст как безымянный документ с нужным языком
  const doc = await vscode.workspace.openTextDocument({
    language: languageId,
    content,
  });
  let funcs = await getFunctions(doc.uri);
  if (funcs.length > 0) {
    return funcs;
  }

  // Способ 2: временный файл с тем же расширением
  const tmp = nodePath.join(
    os.tmpdir(),
    `commit_assistant_head_${Date.now()}_${nodePath.basename(fileName)}`
  );
  try {
    await fs.promises.writeFile(tmp, content);
    funcs = await getFunctions(vscode.Uri.file(tmp));
  } finally {
    await fs.promises.unlink(tmp).catch(() => undefined);
  }
  return funcs;
}

// Какие функции содержат строку (line нумеруется с 1, в VS Code с 0)
function functionsAt(funcs: FuncInfo[], line: number): FuncInfo[] {
  return funcs.filter(
    (f) => line - 1 >= f.range.start.line && line - 1 <= f.range.end.line
  );
}

export function classify(
  oldFuncs: FuncInfo[],
  newFuncs: FuncInfo[],
  diff: ParsedDiff
): FunctionChanges {
  const oldNames = new Set(oldFuncs.map((f) => f.name));
  const newNames = new Set(newFuncs.map((f) => f.name));

  const touched = new Set<string>();
  let outside = 0;

  for (const line of diff.addedLines) {
    const found = functionsAt(newFuncs, line);
    if (found.length === 0) { outside++; }
    found.forEach((f) => touched.add(f.name));
  }
  for (const line of diff.removedLines) {
    const found = functionsAt(oldFuncs, line);
    if (found.length === 0) { outside++; }
    found.forEach((f) => touched.add(f.name));
  }

  return {
    added: [...newNames].filter((n) => !oldNames.has(n)),
    removed: [...oldNames].filter((n) => !newNames.has(n)),
    modified: [...touched].filter((n) => oldNames.has(n) && newNames.has(n)),
    outside,
  };
}