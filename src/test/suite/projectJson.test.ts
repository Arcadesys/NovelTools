import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseProjectJson, serializeToJson } from '../../sceneStitching/projectYaml';

suite('Project JSON', () => {
  test('parseProjectJson parses valid JSON and returns ManuscriptData', () => {
    const uri = vscode.Uri.file(path.join('/fake', 'noveltools.json'));
    const content = JSON.stringify({
      title: 'Test Novel',
      chapters: [
        { folder: 'ch1', title: 'Chapter 1' },
        { folder: 'ch2', scenes: ['scene-a.md', 'scene-b.md'] },
      ],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data, 'Expected parsed data');
    assert.strictEqual(data!.title, 'Test Novel');
    assert.strictEqual(data!.chapters.length, 2);
    assert.strictEqual(data!.chapters[0].folderPath, 'ch1');
    assert.strictEqual(data!.chapters[0].title, 'Chapter 1');
    assert.strictEqual(data!.chapters[1].folderPath, 'ch2');
    assert.strictEqual(data!.chapters[1].scenePaths.length, 2);
  });

  test('serializeToJson then parseProjectJson round-trips', () => {
    const uri = vscode.Uri.file(path.join('/fake', 'noveltools.json'));
    const content = JSON.stringify({
      title: 'Round Trip',
      chapters: [
        { folder: 'draft/one', scenes: ['a.md', 'b.md'] },
        { folder: 'draft/two' },
      ],
      sceneStatus: { 'draft/one/a.md': 'done' },
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data, 'Expected parsed data');
    const baseDir = vscode.Uri.file('/fake');
    const serialized = serializeToJson(data!, baseDir);
    const parsed = JSON.parse(serialized);
    assert.strictEqual(parsed.title, 'Round Trip');
    assert.strictEqual(parsed.chapters.length, 2);
    assert.strictEqual(parsed.chapters[0].folder, 'draft/one');
    assert.deepStrictEqual(parsed.chapters[0].scenes, ['a.md', 'b.md']);
    assert.strictEqual(parsed.chapters[1].folder, 'draft/two');
    assert.strictEqual(parsed.sceneStatus['draft/one/a.md'], 'done');
  });

  test('parseProjectJson returns null for invalid JSON', () => {
    const uri = vscode.Uri.file(path.join('/fake', 'noveltools.json'));
    assert.strictEqual(parseProjectJson('not json', uri), null);
    assert.strictEqual(parseProjectJson('{}', uri), null);
    assert.strictEqual(parseProjectJson('{"chapters":null}', uri), null);
  });
});
