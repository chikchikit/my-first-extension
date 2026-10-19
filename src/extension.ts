import * as vscode from 'vscode';

// Вызывается при активации расширения
export function activate(context: vscode.ExtensionContext) {
  console.log('Расширение "my-first-extension" активировано');

  // Регистрируем команду
  const disposable = vscode.commands.registerCommand(
    'my-first-extension.helloWorld',
    () => {
      // Показываем всплывающее уведомление
      vscode.window.showInformationMessage(
        'Привет из моего первого расширения!'
      );
    }
  );

  // Добавляем в подписки, чтобы ресурс освободился при деактивации
  context.subscriptions.push(disposable);
}

// Вызывается при деактивации расширения
export function deactivate() {
  console.log('Расширение "my-first-extension" деактивировано');
}