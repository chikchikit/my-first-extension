import * as vscode from 'vscode';
import { FileResult } from './messageBuilder';

export type ChangeKind = 'added' | 'modified' | 'removed';

// Узел-функция
export interface FuncNode {
  kind: 'func';
  name: string;
  change: ChangeKind;
  checked: boolean;
  parent: FileNode;
}

// Узел-файл
export interface FileNode {
  kind: 'file';
  result: FileResult;
  checked: boolean;
  funcs: FuncNode[];
}

export type Node = FileNode | FuncNode;

const LABELS: Record<ChangeKind, string> = {
  added: 'добавлена',
  modified: 'изменена',
  removed: 'удалена',
};

const ICONS: Record<ChangeKind, string> = {
  added: 'diff-added',
  modified: 'diff-modified',
  removed: 'diff-removed',
};

export class ChangesTree implements vscode.TreeDataProvider<Node> {
  private files: FileNode[] = [];
  private emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  // Заполняем дерево результатами анализа, всё отмечено галочками
  setResults(results: FileResult[]): void {
    this.files = results.map((r) => {
      const file: FileNode = { kind: 'file', result: r, checked: true, funcs: [] };
      const add = (names: string[], change: ChangeKind) => {
        for (const name of names) {
          file.funcs.push({ kind: 'func', name, change, checked: true, parent: file });
        }
      };
      add(r.added, 'added');
      add(r.modified, 'modified');
      add(r.removed, 'removed');
      return file;
    });
    this.emitter.fire(undefined);
  }

  // Результаты только по отмеченным файлам и функциям
  getSelected(): FileResult[] {
    const pick = (f: FileNode, change: ChangeKind) =>
      f.funcs.filter((x) => x.checked && x.change === change).map((x) => x.name);
    return this.files
      .filter((f) => f.checked)
      .map((f) => ({
        ...f.result,
        added: pick(f, 'added'),
        modified: pick(f, 'modified'),
        removed: pick(f, 'removed'),
      }));
  }

  // Пользователь поставил или снял галочку
  toggle(node: Node, checked: boolean): void {
    node.checked = checked;
    if (node.kind === 'file') {
      node.funcs.forEach((f) => (f.checked = checked));
    } else {
      // файл отмечен, пока отмечена хотя бы одна его функция
      node.parent.checked = node.parent.funcs.some((f) => f.checked);
    }
    this.emitter.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const state = node.checked
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;

    if (node.kind === 'file') {
      const item = new vscode.TreeItem(
        node.result.path,
        node.funcs.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
      item.description =
        node.funcs.length > 0 ? `функций: ${node.funcs.length}` : 'без изменений функций';
      item.iconPath = vscode.ThemeIcon.File;
      item.checkboxState = state;
      return item;
    }

    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.description = LABELS[node.change];
    item.iconPath = new vscode.ThemeIcon(ICONS[node.change]);
    item.checkboxState = state;
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) { return this.files; }
    return node.kind === 'file' ? node.funcs : [];
  }

  getParent(node: Node): Node | undefined {
    return node.kind === 'func' ? node.parent : undefined;
  }
}