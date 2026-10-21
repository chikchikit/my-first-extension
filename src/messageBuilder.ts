// Результат анализа одного файла
export interface FileResult {
  path: string;        // путь относительно папки проекта
  added: string[];     // добавленные функции
  modified: string[];  // изменённые функции
  removed: string[];   // удалённые функции
  outside: number;     // изменённых строк вне функций
}

// Определяем тип коммита по эвристике
function detectType(results: FileResult[]): string {
  const isDoc = (p: string) => /\.(md|txt|rst)$/i.test(p) || p.startsWith('docs/');
  const isTest = (p: string) =>
    /(^|\/)(test|tests|__tests__)\//i.test(p) ||
    /[._](test|spec)\.\w+$/i.test(p) ||
    /(^|\/)test_/i.test(p);

  if (results.every((r) => isDoc(r.path))) { return 'docs'; }
  if (results.every((r) => isTest(r.path))) { return 'test'; }
  if (results.some((r) => r.added.length > 0)) { return 'feat'; }
  if (results.some((r) => r.modified.length > 0 || r.removed.length > 0)) {
    return 'refactor';
  }
  return 'chore';
}

// Заголовок: "feat: update rectangle.py" или "feat: update 3 files"
function buildTitle(results: FileResult[], type: string): string {
  if (results.length === 1) {
    const name = results[0].path.split('/').pop();
    return `${type}: update ${name}`;
  }
  return `${type}: update ${results.length} files`;
}

// Тело: по блоку на каждый файл
function buildBody(results: FileResult[]): string {
  const blocks: string[] = [];
  for (const r of results) {
    const lines: string[] = [r.path];
    if (r.added.length) { lines.push(`- Added: ${r.added.join(', ')}`); }
    if (r.modified.length) { lines.push(`- Changed: ${r.modified.join(', ')}`); }
    if (r.removed.length) { lines.push(`- Removed: ${r.removed.join(', ')}`); }
    if (r.outside > 0) { lines.push(`- Other changes: ${r.outside} line(s)`); }
    if (lines.length === 1) { lines.push('- Changes'); }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

export function buildMessage(results: FileResult[]): string {
  const type = detectType(results);
  return `${buildTitle(results, type)}\n\n${buildBody(results)}`;
}