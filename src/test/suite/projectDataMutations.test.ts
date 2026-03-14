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
  scenePathsRelativeTo,
  dataWithFolderChapters,
  type ManuscriptData,
} from '../../sceneStitching/projectData';

/** Helper: build a minimal ManuscriptData for mutation tests. */
function makeManuscript(opts?: {
  sceneStatus?: ManuscriptData['sceneStatus'];
  sceneMetadata?: ManuscriptData['sceneMetadata'];
  characters?: ManuscriptData['characters'];
  locations?: ManuscriptData['locations'];
  wordCountTarget?: number;
}): ManuscriptData {
  const baseUri = vscode.Uri.file('/fake');
  const ch1Scenes = ['ch1/scene-a.md', 'ch1/scene-b.md'];
  const ch2Scenes = ['ch2/scene-c.md'];
  return {
    title: 'Test Novel',
    chapters: [
      {
        title: 'Chapter 1',
        sceneUris: ch1Scenes.map((p) => vscode.Uri.joinPath(baseUri, p)),
        scenePaths: ch1Scenes,
        folderPath: 'ch1',
      },
      {
        title: 'Chapter 2',
        sceneUris: ch2Scenes.map((p) => vscode.Uri.joinPath(baseUri, p)),
        scenePaths: ch2Scenes,
        folderPath: 'ch2',
      },
    ],
    flatUris: [...ch1Scenes, ...ch2Scenes].map((p) => vscode.Uri.joinPath(baseUri, p)),
    projectFileUri: vscode.Uri.joinPath(baseUri, 'noveltools.json'),
    sceneStatus: opts?.sceneStatus,
    sceneMetadata: opts?.sceneMetadata,
    characters: opts?.characters,
    locations: opts?.locations,
    wordCountTarget: opts?.wordCountTarget,
  };
}

suite('reorderChapters', () => {
  test('swaps two chapters', () => {
    const data = makeManuscript();
    const result = reorderChapters(data, 0, 1);
    assert.strictEqual(result.chapters[0].title, 'Chapter 2');
    assert.strictEqual(result.chapters[1].title, 'Chapter 1');
    assert.strictEqual(result.flatUris.length, 3);
  });

  test('returns same data when from === to', () => {
    const data = makeManuscript();
    const result = reorderChapters(data, 0, 0);
    assert.strictEqual(result, data);
  });

  test('returns same data for negative indices', () => {
    const data = makeManuscript();
    assert.strictEqual(reorderChapters(data, -1, 0), data);
    assert.strictEqual(reorderChapters(data, 0, -1), data);
  });
});

suite('moveScene', () => {
  test('moves scene within same chapter', () => {
    const data = makeManuscript();
    const result = moveScene(data, 0, 1, 0, 0);
    assert.strictEqual(result.chapters[0].scenePaths[0], 'ch1/scene-b.md');
    assert.strictEqual(result.chapters[0].scenePaths[1], 'ch1/scene-a.md');
  });

  test('moves scene across chapters', () => {
    const data = makeManuscript();
    const result = moveScene(data, 0, 0, 1, 1);
    assert.strictEqual(result.chapters[0].scenePaths.length, 1);
    assert.strictEqual(result.chapters[1].scenePaths.length, 2);
    assert.strictEqual(result.chapters[1].scenePaths[1], 'ch1/scene-a.md');
  });

  test('returns same data for invalid chapter indices', () => {
    const data = makeManuscript();
    assert.strictEqual(moveScene(data, 99, 0, 0, 0), data);
    assert.strictEqual(moveScene(data, 0, 0, 99, 0), data);
  });

  test('does not mutate original data', () => {
    const data = makeManuscript();
    const origLen = data.chapters[0].scenePaths.length;
    moveScene(data, 0, 0, 1, 0);
    assert.strictEqual(data.chapters[0].scenePaths.length, origLen);
  });
});

suite('insertScene', () => {
  test('inserts scene at specified position', () => {
    const data = makeManuscript();
    const newUri = vscode.Uri.file('/fake/ch1/scene-new.md');
    const result = insertScene(data, 0, 1, newUri, 'ch1/scene-new.md');
    assert.strictEqual(result.chapters[0].scenePaths.length, 3);
    assert.strictEqual(result.chapters[0].scenePaths[1], 'ch1/scene-new.md');
    assert.strictEqual(result.flatUris.length, 4);
  });

  test('clamps index to valid range', () => {
    const data = makeManuscript();
    const newUri = vscode.Uri.file('/fake/ch1/scene-new.md');
    const result = insertScene(data, 0, 100, newUri, 'ch1/scene-new.md');
    assert.strictEqual(result.chapters[0].scenePaths[result.chapters[0].scenePaths.length - 1], 'ch1/scene-new.md');
  });

  test('returns same data for invalid chapter index', () => {
    const data = makeManuscript();
    const newUri = vscode.Uri.file('/fake/ch1/scene-new.md');
    assert.strictEqual(insertScene(data, 99, 0, newUri, 'ch1/scene-new.md'), data);
  });
});

suite('removeScene', () => {
  test('removes scene from chapter', () => {
    const data = makeManuscript();
    const result = removeScene(data, 0, 0);
    assert.strictEqual(result.chapters[0].scenePaths.length, 1);
    assert.strictEqual(result.chapters[0].scenePaths[0], 'ch1/scene-b.md');
    assert.strictEqual(result.flatUris.length, 2);
  });

  test('removes chapter when last scene is removed', () => {
    const data = makeManuscript();
    const result = removeScene(data, 1, 0);
    assert.strictEqual(result.chapters.length, 1, 'empty chapter should be removed');
  });

  test('cleans up sceneStatus for removed scene', () => {
    const data = makeManuscript({
      sceneStatus: { 'ch1/scene-a.md': 'done', 'ch1/scene-b.md': 'drafted' },
    });
    const result = removeScene(data, 0, 0);
    assert.strictEqual(result.sceneStatus?.['ch1/scene-a.md'], undefined, 'removed scene status should be gone');
    assert.strictEqual(result.sceneStatus?.['ch1/scene-b.md'], 'drafted', 'other scene status should remain');
  });

  test('returns same data for out-of-range scene index', () => {
    const data = makeManuscript();
    assert.strictEqual(removeScene(data, 0, 99), data);
    assert.strictEqual(removeScene(data, 0, -1), data);
  });
});

suite('removeChapter', () => {
  test('removes chapter at index', () => {
    const data = makeManuscript();
    const result = removeChapter(data, 0);
    assert.strictEqual(result.chapters.length, 1);
    assert.strictEqual(result.chapters[0].title, 'Chapter 2');
    assert.strictEqual(result.flatUris.length, 1);
  });

  test('returns same data for out-of-range index', () => {
    const data = makeManuscript();
    assert.strictEqual(removeChapter(data, -1), data);
    assert.strictEqual(removeChapter(data, 99), data);
  });
});

suite('scenePathsRelativeTo', () => {
  test('computes relative paths with forward slashes', () => {
    const baseDir = vscode.Uri.file('/projects/novel');
    const uris = [
      vscode.Uri.file('/projects/novel/ch1/scene-a.md'),
      vscode.Uri.file('/projects/novel/ch2/scene-b.md'),
    ];
    const result = scenePathsRelativeTo(baseDir, uris);
    assert.deepStrictEqual(result, ['ch1/scene-a.md', 'ch2/scene-b.md']);
  });
});

suite('parseProjectJson — metadata & registries', () => {
  test('parses scene metadata', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Meta Test',
      chapters: [{ folder: 'ch1', scenes: ['scene.md'] }],
      sceneMetadata: {
        'ch1/scene.md': {
          synopsis: 'A test scene',
          pov: 'Alice',
          setting: 'Library',
          timeline: 'Day 1',
          tags: ['tension', 'dialogue'],
        },
      },
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    const meta = data!.sceneMetadata?.['ch1/scene.md'];
    assert.ok(meta, 'Expected scene metadata');
    assert.strictEqual(meta!.synopsis, 'A test scene');
    assert.strictEqual(meta!.pov, 'Alice');
    assert.strictEqual(meta!.setting, 'Library');
    assert.strictEqual(meta!.timeline, 'Day 1');
    assert.deepStrictEqual(meta!.tags, ['tension', 'dialogue']);
  });

  test('parses characters', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Char Test',
      chapters: [{ folder: 'ch1' }],
      characters: [
        { name: 'Alice', description: 'Protagonist' },
        { name: 'Bob' },
      ],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.characters?.length, 2);
    assert.strictEqual(data!.characters![0].name, 'Alice');
    assert.strictEqual(data!.characters![0].description, 'Protagonist');
    assert.strictEqual(data!.characters![1].name, 'Bob');
    assert.strictEqual(data!.characters![1].description, undefined);
  });

  test('parses locations', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Loc Test',
      chapters: [{ folder: 'ch1' }],
      locations: [
        { name: 'Library', description: 'Old stone building' },
        { name: 'Park' },
      ],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.locations?.length, 2);
    assert.strictEqual(data!.locations![0].name, 'Library');
    assert.strictEqual(data!.locations![1].name, 'Park');
  });

  test('parses wordCountTarget', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'WC Test',
      chapters: [{ folder: 'ch1' }],
      wordCountTarget: 80000,
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.wordCountTarget, 80000);
  });

  test('ignores invalid wordCountTarget', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'WC Test',
      chapters: [{ folder: 'ch1' }],
      wordCountTarget: -100,
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.wordCountTarget, undefined);
  });

  test('ignores empty characters array', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Empty',
      chapters: [{ folder: 'ch1' }],
      characters: [],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.characters, undefined);
  });

  test('filters invalid scene status values', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Status Test',
      chapters: [{ folder: 'ch1', scenes: ['a.md', 'b.md'] }],
      sceneStatus: {
        'ch1/a.md': 'done',
        'ch1/b.md': 'INVALID_STATUS',
      },
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.sceneStatus?.['ch1/a.md'], 'done');
    assert.strictEqual(data!.sceneStatus?.['ch1/b.md'], undefined, 'invalid status should be filtered');
  });

  test('handles all six scene statuses', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const statuses = ['drafted', 'revision', 'review', 'done', 'spiked', 'cut'];
    const sceneStatus: Record<string, string> = {};
    const scenes = statuses.map((s, i) => {
      const name = `scene${i}.md`;
      sceneStatus[`ch1/${name}`] = s;
      return name;
    });
    const content = JSON.stringify({
      title: 'All Statuses',
      chapters: [{ folder: 'ch1', scenes }],
      sceneStatus,
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    for (const s of statuses) {
      const found = Object.values(data!.sceneStatus ?? {}).includes(s as any);
      assert.ok(found, `Status '${s}' should be preserved`);
    }
  });
});

suite('serializeToJson — round-trip with metadata', () => {
  test('round-trips scene metadata', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Round Trip Meta',
      chapters: [{ folder: 'ch1', scenes: ['scene.md'] }],
      sceneMetadata: {
        'ch1/scene.md': {
          synopsis: 'Test',
          pov: 'Alice',
          tags: ['tag1'],
        },
      },
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    const serialized = serializeToJson(data!, vscode.Uri.file('/fake'));
    const parsed = JSON.parse(serialized);
    assert.ok(parsed.sceneMetadata?.['ch1/scene.md']);
    assert.strictEqual(parsed.sceneMetadata['ch1/scene.md'].synopsis, 'Test');
    assert.strictEqual(parsed.sceneMetadata['ch1/scene.md'].pov, 'Alice');
    assert.deepStrictEqual(parsed.sceneMetadata['ch1/scene.md'].tags, ['tag1']);
  });

  test('round-trips characters and locations', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Registry RT',
      chapters: [{ folder: 'ch1' }],
      characters: [{ name: 'Alice', description: 'Hero' }],
      locations: [{ name: 'Castle' }],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    const serialized = serializeToJson(data!, vscode.Uri.file('/fake'));
    const parsed = JSON.parse(serialized);
    assert.strictEqual(parsed.characters[0].name, 'Alice');
    assert.strictEqual(parsed.locations[0].name, 'Castle');
  });

  test('round-trips wordCountTarget', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'WC RT',
      chapters: [{ folder: 'ch1' }],
      wordCountTarget: 75000,
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    const serialized = serializeToJson(data!, vscode.Uri.file('/fake'));
    const parsed = JSON.parse(serialized);
    assert.strictEqual(parsed.wordCountTarget, 75000);
  });

  test('omits empty optional fields from JSON', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Minimal',
      chapters: [{ folder: 'ch1', scenes: ['s.md'] }],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    const serialized = serializeToJson(data!, vscode.Uri.file('/fake'));
    const parsed = JSON.parse(serialized);
    assert.strictEqual(parsed.sceneStatus, undefined, 'no sceneStatus when empty');
    assert.strictEqual(parsed.sceneMetadata, undefined, 'no sceneMetadata when empty');
    assert.strictEqual(parsed.characters, undefined, 'no characters when empty');
    assert.strictEqual(parsed.locations, undefined, 'no locations when empty');
    assert.strictEqual(parsed.wordCountTarget, undefined, 'no wordCountTarget when empty');
  });
});

suite('parseProjectJson — chapter structures', () => {
  test('handles string-only chapter (folder shorthand)', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'String Chapters',
      chapters: ['chapter-one', 'chapter-two'],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.chapters.length, 2);
    assert.strictEqual(data!.chapters[0].folderPath, 'chapter-one');
    assert.strictEqual(data!.chapters[1].folderPath, 'chapter-two');
  });

  test('handles chapter with explicit scenes but no folder', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'No Folder',
      chapters: [
        { title: 'Prologue', scenes: ['prologue/opening.md', 'prologue/end.md'] },
      ],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.chapters[0].scenePaths.length, 2);
    assert.strictEqual(data!.chapters[0].scenePaths[0], 'prologue/opening.md');
  });

  test('merges consecutive chapters with same folder', () => {
    const uri = vscode.Uri.file('/fake/noveltools.json');
    const content = JSON.stringify({
      title: 'Merge Test',
      chapters: [
        { folder: 'ch1', scenes: ['a.md'] },
        { folder: 'ch1', scenes: ['b.md'] },
      ],
    });
    const data = parseProjectJson(content, uri);
    assert.ok(data);
    assert.strictEqual(data!.chapters.length, 1, 'consecutive same-folder chapters should merge');
    assert.strictEqual(data!.chapters[0].scenePaths.length, 2);
  });
});

suite('dataWithFolderChapters', () => {
  test('infers folder from scenes sharing a directory', () => {
    const baseUri = vscode.Uri.file('/project');
    const data: ManuscriptData = {
      title: 'Infer Folder',
      chapters: [{
        title: 'Chapter 1',
        sceneUris: [
          vscode.Uri.file('/project/ch1/a.md'),
          vscode.Uri.file('/project/ch1/b.md'),
        ],
        scenePaths: ['ch1/a.md', 'ch1/b.md'],
      }],
      flatUris: [
        vscode.Uri.file('/project/ch1/a.md'),
        vscode.Uri.file('/project/ch1/b.md'),
      ],
      projectFileUri: vscode.Uri.file('/project/noveltools.json'),
    };
    const result = dataWithFolderChapters(data, baseUri);
    assert.strictEqual(result.chapters[0].folderPath, 'ch1');
  });

  test('does not infer folder when scenes are in different dirs', () => {
    const baseUri = vscode.Uri.file('/project');
    const data: ManuscriptData = {
      title: 'No Infer',
      chapters: [{
        title: 'Mixed',
        sceneUris: [
          vscode.Uri.file('/project/ch1/a.md'),
          vscode.Uri.file('/project/ch2/b.md'),
        ],
        scenePaths: ['ch1/a.md', 'ch2/b.md'],
      }],
      flatUris: [
        vscode.Uri.file('/project/ch1/a.md'),
        vscode.Uri.file('/project/ch2/b.md'),
      ],
      projectFileUri: vscode.Uri.file('/project/noveltools.json'),
    };
    const result = dataWithFolderChapters(data, baseUri);
    assert.strictEqual(result.chapters[0].folderPath, undefined);
  });
});
