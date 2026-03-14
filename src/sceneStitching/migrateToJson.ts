import * as path from 'path';
import * as vscode from 'vscode';
import { parseProjectYaml, serializeToJson } from './projectData';
import { clearManuscriptCache } from './sceneList';

export function registerMigrateToJson(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('noveltools.migrateToJson', () => runMigration())
  );
}

async function runMigration(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    await vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  // Find YAML project files in workspace
  const yamlFiles: vscode.Uri[] = [];
  for (const pattern of ['**/noveltools.yaml', '**/noveltools.yml']) {
    try {
      const found = await vscode.workspace.findFiles(pattern);
      yamlFiles.push(...found);
    } catch {
      // continue
    }
  }

  if (yamlFiles.length === 0) {
    await vscode.window.showInformationMessage('No YAML project files found to migrate.');
    return;
  }

  // Let user pick which file to migrate if multiple
  let targetUri: vscode.Uri;
  if (yamlFiles.length === 1) {
    targetUri = yamlFiles[0];
  } else {
    type Item = vscode.QuickPickItem & { uri: vscode.Uri };
    const items: Item[] = yamlFiles.map((uri) => ({
      label: vscode.workspace.asRelativePath(uri),
      uri,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select YAML project file to migrate',
    });
    if (!picked) return;
    targetUri = picked.uri;
  }

  // Read and parse the YAML file
  let content: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(targetUri);
    content = new TextDecoder().decode(bytes);
  } catch (err) {
    await vscode.window.showErrorMessage(
      `Could not read ${vscode.workspace.asRelativePath(targetUri)}: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  const data = parseProjectYaml(content, targetUri);
  if (!data) {
    await vscode.window.showErrorMessage(
      `Could not parse ${vscode.workspace.asRelativePath(targetUri)}. Check the YAML syntax.`
    );
    return;
  }

  // Determine the JSON output path
  const yamlPath = targetUri.fsPath;
  const dir = path.dirname(yamlPath);
  const stem = path.basename(yamlPath, path.extname(yamlPath));
  const jsonPath = path.join(dir, `${stem}.json`);
  const jsonUri = vscode.Uri.file(jsonPath);

  // Check if JSON file already exists
  try {
    await vscode.workspace.fs.stat(jsonUri);
    const overwrite = await vscode.window.showWarningMessage(
      `${stem}.json already exists. Overwrite it?`,
      { modal: true },
      'Overwrite'
    );
    if (overwrite !== 'Overwrite') return;
  } catch {
    // File doesn't exist — good
  }

  // Serialize to JSON
  const baseDir = vscode.Uri.joinPath(targetUri, '..');
  const json = serializeToJson(data, baseDir);

  // Write JSON file
  await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(json, 'utf8'));

  // Rename YAML to .bak (non-destructive)
  const bakUri = vscode.Uri.file(`${yamlPath}.bak`);
  try {
    await vscode.workspace.fs.rename(targetUri, bakUri, { overwrite: true });
  } catch (err) {
    // If rename fails, warn but don't block — the JSON was written successfully
    await vscode.window.showWarningMessage(
      `JSON file written, but could not rename YAML to .bak: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  clearManuscriptCache();
  await vscode.commands.executeCommand('noveltools.refreshManuscript');

  const rel = vscode.workspace.asRelativePath(jsonUri);
  await vscode.window.showInformationMessage(
    `Migrated to ${rel}. Original YAML saved as ${path.basename(yamlPath)}.bak.`
  );

  // Open the new JSON file
  const doc = await vscode.workspace.openTextDocument(jsonUri);
  await vscode.window.showTextDocument(doc, { preview: true });
}
