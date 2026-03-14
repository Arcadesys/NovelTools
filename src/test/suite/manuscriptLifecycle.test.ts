import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  parseProjectJson,
  serializeToJson,
  reorderChapters,
  moveScene,
  insertScene,
  removeScene,
  removeChapter,
} from '../../sceneStitching/projectData';

/**
 * End-to-end lifecycle test: simulates a writer building and modifying a novel project
 * through the data model layer.
 */
suite('Manuscript lifecycle', () => {
  test('full write → modify → serialize cycle', () => {
    const projectUri = vscode.Uri.file('/novels/my-novel/noveltools.json');
    const baseDir = vscode.Uri.file('/novels/my-novel');

    // Step 1: Parse a fresh project
    const initial = parseProjectJson(JSON.stringify({
      title: 'The Midnight Garden',
      chapters: [
        { folder: 'ch1', title: 'The Arrival', scenes: ['opening.md', 'first-night.md'] },
        { folder: 'ch2', title: 'The Discovery', scenes: ['morning.md'] },
        { folder: 'ch3', title: 'The Departure', scenes: ['goodbye.md'] },
      ],
      sceneStatus: {
        'ch1/opening.md': 'done',
        'ch1/first-night.md': 'drafted',
        'ch2/morning.md': 'revision',
        'ch3/goodbye.md': 'drafted',
      },
      sceneMetadata: {
        'ch1/opening.md': { pov: 'Clara', setting: 'Train Station', synopsis: 'Clara arrives in the village' },
        'ch2/morning.md': { pov: 'Clara', setting: 'Garden', timeline: 'Day 2' },
      },
      characters: [
        { name: 'Clara', description: 'Young botanist, protagonist' },
        { name: 'Edmund', description: 'Mysterious gardener' },
      ],
      locations: [
        { name: 'Train Station', description: 'Small rural station' },
        { name: 'Garden', description: 'Overgrown midnight garden behind the manor' },
      ],
      wordCountTarget: 60000,
    }), projectUri);

    assert.ok(initial, 'Should parse successfully');
    assert.strictEqual(initial!.title, 'The Midnight Garden');
    assert.strictEqual(initial!.chapters.length, 3);
    assert.strictEqual(initial!.flatUris.length, 4);
    assert.strictEqual(initial!.wordCountTarget, 60000);
    assert.strictEqual(initial!.characters?.length, 2);
    assert.strictEqual(initial!.locations?.length, 2);

    // Step 2: Reorder chapters (move ch3 before ch2)
    let data = reorderChapters(initial!, 2, 1);
    assert.strictEqual(data.chapters[1].title, 'The Departure');
    assert.strictEqual(data.chapters[2].title, 'The Discovery');

    // Step 3: Move a scene between chapters
    data = moveScene(data, 0, 1, 1, 0); // move first-night from ch1 to ch3 (now at index 1)
    assert.strictEqual(data.chapters[0].scenePaths.length, 1, 'ch1 should have 1 scene left');
    assert.strictEqual(data.chapters[1].scenePaths.length, 2, 'ch3 should have 2 scenes');

    // Step 4: Insert a new scene
    const newSceneUri = vscode.Uri.file('/novels/my-novel/ch1/flashback.md');
    data = insertScene(data, 0, 1, newSceneUri, 'ch1/flashback.md');
    assert.strictEqual(data.chapters[0].scenePaths.length, 2);
    assert.strictEqual(data.chapters[0].scenePaths[1], 'ch1/flashback.md');

    // Step 5: Remove a scene
    data = removeScene(data, 2, 0); // remove the only scene in ch2
    // ch2 had 1 scene, so it should be removed entirely
    assert.strictEqual(data.chapters.length, 2, 'empty chapter removed');

    // Step 6: Remove a chapter
    data = removeChapter(data, 1); // remove what was ch3
    assert.strictEqual(data.chapters.length, 1, 'only ch1 remains');

    // Step 7: Serialize and verify structure
    const json = serializeToJson(data, baseDir);
    const reparsed = parseProjectJson(json, projectUri);
    assert.ok(reparsed);
    assert.strictEqual(reparsed!.title, 'The Midnight Garden');
    assert.strictEqual(reparsed!.chapters.length, 1);
    assert.strictEqual(reparsed!.wordCountTarget, 60000);
    assert.strictEqual(reparsed!.characters?.length, 2);
  });

  test('status survives scene removal correctly', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const data = parseProjectJson(JSON.stringify({
      title: 'Status Test',
      chapters: [
        { folder: 'ch1', scenes: ['a.md', 'b.md', 'c.md'] },
      ],
      sceneStatus: {
        'ch1/a.md': 'done',
        'ch1/b.md': 'spiked',
        'ch1/c.md': 'drafted',
      },
    }), uri);

    assert.ok(data);
    // Remove the spiked scene (index 1)
    const result = removeScene(data!, 0, 1);
    assert.strictEqual(result.chapters[0].scenePaths.length, 2);
    assert.strictEqual(result.sceneStatus?.['ch1/a.md'], 'done', 'a.md status preserved');
    assert.strictEqual(result.sceneStatus?.['ch1/b.md'], undefined, 'b.md status removed');
    assert.strictEqual(result.sceneStatus?.['ch1/c.md'], 'drafted', 'c.md status preserved');
  });

  test('metadata keys survive round-trip with complex data', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const input = {
      title: 'Complex Novel',
      chapters: [
        { folder: 'act-1', scenes: ['prologue.md', 'chapter-1.md'] },
        { folder: 'act-2', scenes: ['midpoint.md'] },
      ],
      sceneStatus: {
        'act-1/prologue.md': 'done',
        'act-1/chapter-1.md': 'revision',
        'act-2/midpoint.md': 'review',
      },
      sceneMetadata: {
        'act-1/prologue.md': {
          synopsis: 'The world before',
          pov: 'Narrator',
          setting: 'Void',
          timeline: 'Before time',
          tags: ['creation', 'mythology'],
        },
        'act-2/midpoint.md': {
          synopsis: 'Everything changes',
          pov: 'Hero',
          tags: ['turning-point'],
        },
      },
      characters: [
        { name: 'Narrator', description: 'Omniscient voice' },
        { name: 'Hero' },
      ],
      locations: [
        { name: 'Void', description: 'The space between worlds' },
      ],
      wordCountTarget: 120000,
    };

    const data = parseProjectJson(JSON.stringify(input), uri);
    assert.ok(data);
    const serialized = serializeToJson(data!, vscode.Uri.file('/fake'));
    const reparsed = JSON.parse(serialized);

    // All top-level fields present
    assert.strictEqual(reparsed.title, 'Complex Novel');
    assert.strictEqual(reparsed.chapters.length, 2);
    assert.strictEqual(reparsed.wordCountTarget, 120000);

    // Status preserved
    assert.strictEqual(reparsed.sceneStatus['act-1/prologue.md'], 'done');
    assert.strictEqual(reparsed.sceneStatus['act-2/midpoint.md'], 'review');

    // Metadata preserved
    const meta = reparsed.sceneMetadata['act-1/prologue.md'];
    assert.strictEqual(meta.synopsis, 'The world before');
    assert.strictEqual(meta.pov, 'Narrator');
    assert.deepStrictEqual(meta.tags, ['creation', 'mythology']);

    // Registries preserved
    assert.strictEqual(reparsed.characters.length, 2);
    assert.strictEqual(reparsed.locations.length, 1);
  });
});
