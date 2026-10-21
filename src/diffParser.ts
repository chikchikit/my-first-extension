export interface ParsedDiff {
  addedLines: number[];   // номера строк в НОВОМ файле, которые добавлены
  removedLines: number[]; // номера строк в СТАРОМ файле, которые удалены
}

export function parseDiff(diff: string): ParsedDiff {
  const addedLines: number[] = [];
  const removedLines: number[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of diff.split('\n')) {
    // Заголовок блока: @@ -старый_начало,длина +новый_начало,длина @@
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      oldLine = parseInt(header[1], 10);
      newLine = parseInt(header[2], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      continue; // служебные строки до первого блока (--- a/file, +++ b/file)
    }
    if (line.startsWith('+')) {
      addedLines.push(newLine);
      newLine++;
    } else if (line.startsWith('-')) {
      removedLines.push(oldLine);
      oldLine++;
    } else if (line.startsWith('\\')) {
      continue; // "\ No newline at end of file"
    } else {
      oldLine++; // контекстная строка есть в обоих файлах
      newLine++;
    }
  }
  return { addedLines, removedLines };
}