import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseProjectJson, parseProjectYaml, serializeToJson } from '../../sceneStitching/projectData';

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

suite('Project YAML backward compat', () => {
  test('parseProjectYaml reads YAML project file', () => {
    const uri = vscode.Uri.file(path.join('/fake', 'noveltools.yaml'));
    const yaml = [
      'title: YAML Novel',
      'chapters:',
      '  - folder: ch1',
      '    title: First Chapter',
      '  - folder: ch2',
      '    scenes:',
      '      - scene-a.md',
      '      - scene-b.md',
    ].join('\n');
    const data = parseProjectYaml(yaml, uri);
    assert.ok(data, 'Expected parsed data from YAML');
    assert.strictEqual(data!.title, 'YAML Novel');
    assert.strictEqual(data!.chapters.length, 2);
    assert.strictEqual(data!.chapters[0].folderPath, 'ch1');
    assert.strictEqual(data!.chapters[0].title, 'First Chapter');
    assert.strictEqual(data!.chapters[1].scenePaths.length, 2);
  });

  test('parseProjectYaml returns null for invalid YAML', () => {
    const uri = vscode.Uri.file(path.join('/fake', 'noveltools.yaml'));
    assert.strictEqual(parseProjectYaml('title: Test', uri), null);
    assert.strictEqual(parseProjectYaml('not: [valid: yaml: here', uri), null);
  });

  test('YAML to JSON migration produces equivalent data', () => {
    const yamlUri = vscode.Uri.file(path.join('/fake', 'noveltools.yaml'));
    const yaml = [
      'title: Migration Test',
      'chapters:',
      '  - folder: draft/one',
      '    scenes:',
      '      - a.md',
      '      - b.md',
      '  - folder: draft/two',
      'sceneStatus:',
      '  draft/one/a.md: done',
    ].join('\n');
    const data = parseProjectYaml(yaml, yamlUri);
    assert.ok(data, 'Expected parsed YAML data');

    const baseDir = vscode.Uri.file('/fake');
    const json = serializeToJson(data!, baseDir);
    const jsonUri = vscode.Uri.file(path.join('/fake', 'noveltools.json'));
    const roundTripped = parseProjectJson(json, jsonUri);

    assert.ok(roundTripped, 'Expected round-tripped JSON data');
    assert.strictEqual(roundTripped!.title, 'Migration Test');
    assert.strictEqual(roundTripped!.chapters.length, 2);
    assert.strictEqual(roundTripped!.sceneStatus?.['draft/one/a.md'], 'done');
  });
});
