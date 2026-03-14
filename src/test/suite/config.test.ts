import * as assert from 'assert';
import {
  getProjectFile,
  getSceneGlob,
  getChapterGrouping,
  getWordCountStripMarkdown,
  getWordCountManuscriptScope,
  getChapterContextPath,
  getStitchedSceneHeadingMode,
} from '../../config';

suite('Config defaults', () => {
  test('getProjectFile returns noveltools.json by default', () => {
    const result = getProjectFile();
    // In a clean test environment, this should be the default.
    assert.strictEqual(result, 'noveltools.json');
  });

  test('getSceneGlob returns **/*.md by default', () => {
    const result = getSceneGlob();
    assert.strictEqual(result, '**/*.md');
  });

  test('getChapterGrouping returns flat or folder', () => {
    const result = getChapterGrouping();
    assert.ok(result === 'flat' || result === 'folder', `unexpected grouping: ${result}`);
  });

  test('getWordCountStripMarkdown returns boolean', () => {
    const result = getWordCountStripMarkdown();
    assert.strictEqual(typeof result, 'boolean');
  });

  test('getWordCountManuscriptScope returns project or workspace', () => {
    const result = getWordCountManuscriptScope();
    assert.ok(result === 'project' || result === 'workspace', `unexpected scope: ${result}`);
  });

  test('getChapterContextPath returns a non-empty string', () => {
    const result = getChapterContextPath();
    assert.ok(result.length > 0);
    assert.ok(result.includes('noveltools'), `expected path to mention noveltools, got: ${result}`);
  });

  test('getStitchedSceneHeadingMode returns valid mode', () => {
    const result = getStitchedSceneHeadingMode();
    assert.ok(
      result === 'fileName' || result === 'sceneNumber' || result === 'none',
      `unexpected mode: ${result}`
    );
  });
});
