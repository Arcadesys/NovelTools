import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { clearManuscriptCache, findAllIndexYaml, getManuscript } from '../../sceneStitching/sceneList';

suite('Index discovery', () => {
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

  test('findAllIndexYaml finds Index.YAML in workspace', async () => {
    const found = await findAllIndexYaml();
    const hasIndexYaml = found.some((u) =>
      /[iI]ndex\.(yaml|YAML|yml|YML|md|MD)$/i.test(path.basename(u.fsPath))
    );
    assert.ok(
      found.length > 0,
      `Expected at least one index file, got ${found.length}. Workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'none'}`
    );
    assert.ok(hasIndexYaml, `Expected index file in results, got: ${found.map((u) => u.fsPath).join(', ')}`);
  });

  test('getManuscript loads from discovered index', async () => {
    const result = await getManuscript();
    assert.ok(result.projectFileUri, 'Expected project file URI to be set');
    assert.ok(result.data, 'Expected manuscript data to load');
    assert.ok(
      result.flatUris.length > 0,
      `Expected at least one scene, got ${result.flatUris.length}`
    );
  });

  test('getManuscript falls back to noveltools.yaml when discovered index is not parseable', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'Expected workspace folder');
    if (!folder) return;

    const invalidIndexUri = vscode.Uri.joinPath(folder.uri, 'Index.md');
    const sceneUri = vscode.Uri.joinPath(folder.uri, 'fallback-scene.md');
    const projectUri = vscode.Uri.joinPath(folder.uri, 'noveltools.yaml');

    const config = vscode.workspace.getConfiguration('noveltools');
    const prevGlob = config.get<string>('indexYamlGlob');
    const prevProjectFile = config.get<string>('projectFile');

    try {
      await vscode.workspace.fs.writeFile(invalidIndexUri, Buffer.from('# Not a manuscript index\n', 'utf8'));
      await vscode.workspace.fs.writeFile(sceneUri, Buffer.from('# Scene\n', 'utf8'));
      await vscode.workspace.fs.writeFile(
        projectUri,
        Buffer.from(
          'title: "Fallback Project"\nchapters:\n  - folder: "."\n    scenes:\n      - "fallback-scene.md"\n',
          'utf8'
        )
      );

      await config.update('indexYamlGlob', '**/Index.md', vscode.ConfigurationTarget.Workspace);
      await config.update('projectFile', 'noveltools.yaml', vscode.ConfigurationTarget.Workspace);
      clearManuscriptCache();

      const result = await getManuscript();
      assert.ok(result.projectFileUri, 'Expected project file URI to be set');
      assert.strictEqual(
        path.basename(result.projectFileUri!.fsPath),
        'noveltools.yaml',
        `Expected fallback to noveltools.yaml, got ${result.projectFileUri?.fsPath}`
      );
      assert.ok(result.data, 'Expected manuscript data from noveltools.yaml');
      assert.ok(
        result.flatUris.some((u) => path.basename(u.fsPath) === 'fallback-scene.md'),
        `Expected fallback scene to be included, got: ${result.flatUris.map((u) => u.fsPath).join(', ')}`
      );
    } finally {
      await config.update('indexYamlGlob', prevGlob, vscode.ConfigurationTarget.Workspace);
      await config.update('projectFile', prevProjectFile, vscode.ConfigurationTarget.Workspace);
      clearManuscriptCache();
      try {
        await vscode.workspace.fs.delete(invalidIndexUri);
      } catch {
        // ignore
      }
      try {
        await vscode.workspace.fs.delete(sceneUri);
      } catch {
        // ignore
      }
      try {
        await vscode.workspace.fs.delete(projectUri);
      } catch {
        // ignore
      }
    }
  });
});
