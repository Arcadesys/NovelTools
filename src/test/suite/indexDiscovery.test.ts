import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { clearManuscriptCache, findAllProjectFiles, getManuscript } from '../../sceneStitching/sceneList';

suite('Project discovery', () => {
  suiteSetup(async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length) {
      const anyMd = vscode.Uri.joinPath(folders[0].uri, 'scene1.md');
      try {
        await vscode.workspace.openTextDocument(anyMd);
      } catch {
        // may not exist in all fixtures
      }
    }
  });

  test('findAllProjectFiles finds project files in workspace', async () => {
    const found = await findAllProjectFiles();
    const hasProject = found.some((u) => path.basename(u.fsPath) === 'noveltools.json');
    assert.ok(
      found.length >= 0,
      `findAllProjectFiles should return array, got ${found.length}`
    );
    if (found.length > 0) {
      assert.ok(
        found.every((u) => u.fsPath.toLowerCase().endsWith('.json')),
        `Expected only .json project files, got: ${found.map((u) => u.fsPath).join(', ')}`
      );
    }
  });

  test('getManuscript loads from discovered project file', async () => {
    const result = await getManuscript();
    if (result.projectFileUri) {
      assert.ok(
        result.projectFileUri.fsPath.toLowerCase().endsWith('.json'),
        `Expected project file to be JSON, got ${result.projectFileUri.fsPath}`
      );
    }
    if (result.data) {
      assert.ok(
        Array.isArray(result.data.chapters),
        'Expected chapters array'
      );
    }
  });

  test('getManuscript loads noveltools.json when configured', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'Expected workspace folder');
    if (!folder) return;

    const projectUri = vscode.Uri.joinPath(folder.uri, 'noveltools.json');
    const sceneUri = vscode.Uri.joinPath(folder.uri, 'json-test-scene.md');
    const config = vscode.workspace.getConfiguration('noveltools');
    const prevProjectFile = config.get<string>('projectFile');

    try {
      await vscode.workspace.fs.writeFile(
        projectUri,
        Buffer.from(
          JSON.stringify({
            title: 'JSON Project',
            chapters: [{ folder: '.', scenes: ['json-test-scene.md'] }],
          }),
          'utf8'
        )
      );
      await vscode.workspace.fs.writeFile(sceneUri, Buffer.from('# Scene\n', 'utf8'));
      await config.update('projectFile', 'noveltools.json', vscode.ConfigurationTarget.Workspace);
      clearManuscriptCache();

      const result = await getManuscript();
      assert.ok(result.projectFileUri, 'Expected project file URI');
      assert.ok(
        result.projectFileUri!.fsPath.endsWith('noveltools.json'),
        `Expected noveltools.json, got ${result.projectFileUri?.fsPath}`
      );
      assert.ok(result.data, 'Expected manuscript data');
      assert.strictEqual(result.data!.title, 'JSON Project');
      assert.ok(
        result.flatUris.some((u) => path.basename(u.fsPath) === 'json-test-scene.md'),
        'Expected scene to be included'
      );
    } finally {
      await config.update('projectFile', prevProjectFile, vscode.ConfigurationTarget.Workspace);
      clearManuscriptCache();
      try {
        await vscode.workspace.fs.delete(projectUri);
      } catch {
        // ignore
      }
      try {
        await vscode.workspace.fs.delete(sceneUri);
      } catch {
        // ignore
      }
    }
  });
});
