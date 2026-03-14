import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildSceneHeadingText, buildSceneHeadingLine } from '../../sceneStitching/sceneHeading';

suite('buildSceneHeadingText', () => {
  test('fileName mode returns pretty filename', () => {
    const uri = vscode.Uri.file('/project/ch1/the-opening-scene.md');
    const result = buildSceneHeadingText(uri, 0, 'fileName');
    assert.strictEqual(result, 'the opening scene');
  });

  test('fileName mode handles underscores', () => {
    const uri = vscode.Uri.file('/project/ch1/my_scene_file.md');
    const result = buildSceneHeadingText(uri, 0, 'fileName');
    assert.strictEqual(result, 'my scene file');
  });

  test('fileName mode handles mixed delimiters', () => {
    const uri = vscode.Uri.file('/project/ch1/scene-one_two.md');
    const result = buildSceneHeadingText(uri, 0, 'fileName');
    assert.strictEqual(result, 'scene one two');
  });

  test('fileName mode falls back to Scene N+1 for empty stem', () => {
    const uri = vscode.Uri.file('/project/ch1/.md');
    const result = buildSceneHeadingText(uri, 2, 'fileName');
    assert.strictEqual(result, 'Scene 3');
  });

  test('sceneNumber mode returns Scene N+1', () => {
    const uri = vscode.Uri.file('/project/ch1/anything.md');
    assert.strictEqual(buildSceneHeadingText(uri, 0, 'sceneNumber'), 'Scene 1');
    assert.strictEqual(buildSceneHeadingText(uri, 4, 'sceneNumber'), 'Scene 5');
  });

  test('none mode returns empty string', () => {
    const uri = vscode.Uri.file('/project/ch1/anything.md');
    assert.strictEqual(buildSceneHeadingText(uri, 0, 'none'), '');
  });
});

suite('buildSceneHeadingLine', () => {
  test('produces numbered heading with text', () => {
    const result = buildSceneHeadingLine(0, 0, 'Opening Scene');
    assert.strictEqual(result, '### 1.1 Opening Scene');
  });

  test('produces numbered heading for later indices', () => {
    const result = buildSceneHeadingLine(2, 3, 'Scene Title');
    assert.strictEqual(result, '### 3.4 Scene Title');
  });

  test('produces number-only heading for empty text', () => {
    const result = buildSceneHeadingLine(0, 0, '');
    assert.strictEqual(result, '### 1.1');
  });

  test('produces number-only heading for whitespace text', () => {
    const result = buildSceneHeadingLine(0, 0, '   ');
    assert.strictEqual(result, '### 1.1');
  });
});
