// ポート番号だけで停止すると、ブラウザや他プロジェクトも巻き込むため実行元を確認する。
export function isWorkspaceVite(commandLine, workspaceRoot) {
  const normalize = (value) => value.replaceAll('\\', '/').toLowerCase();
  const command = normalize(commandLine);
  const root = normalize(workspaceRoot).replace(/\/$/, '');
  return (
    (command.includes(`${root}/packages/frontend/node_modules/`) ||
      command.includes(`${root}/node_modules/`)) &&
    /\/vite\/bin\/vite\.js(?:["'\s]|$)/.test(command)
  );
}
