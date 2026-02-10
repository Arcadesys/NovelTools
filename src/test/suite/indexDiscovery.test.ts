import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { findAllIndexYaml, getManuscript } from '../../sceneStitching/sceneList';

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
});
