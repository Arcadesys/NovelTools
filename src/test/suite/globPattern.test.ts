import * as assert from 'assert';
import * as path from 'path';
import { Minimatch } from 'minimatch';

const DEFAULT_GLOB = '**/*[iI]ndex*.{yaml,yml,YAML,YML,md,MD}';

function matchesGlob(globPattern: string, filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  const matcher = new Minimatch(globPattern, { dot: true });
  return matcher.match(normalized);
}

suite('Index discovery glob pattern', () => {
  test('default glob matches Index.YAML', () => {
    assert.ok(matchesGlob(DEFAULT_GLOB, 'Index.YAML'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'project/Index.YAML'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'a/b/c/Index.YAML'));
  });

  test('default glob matches index.yaml and variants', () => {
    assert.ok(matchesGlob(DEFAULT_GLOB, 'index.yaml'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'Index.yaml'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'index.YAML'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'index.yml'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'Index.yml'));
  });

  test('default glob matches Index.md and variants', () => {
    assert.ok(matchesGlob(DEFAULT_GLOB, 'Index.md'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'index.md'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'Index.MD'));
    assert.ok(matchesGlob(DEFAULT_GLOB, 'manuscript/Index.md'));
  });

  test('default glob matches ! Index.yaml style names', () => {
    assert.ok(matchesGlob(DEFAULT_GLOB, '! Index.yaml'));
    assert.ok(matchesGlob(DEFAULT_GLOB, '! Index.YAML'));
  });

  test('default glob rejects non-index files', () => {
    assert.ok(!matchesGlob(DEFAULT_GLOB, 'noveltools.yaml'));
    assert.ok(!matchesGlob(DEFAULT_GLOB, 'chapter1.md'));
    assert.ok(!matchesGlob(DEFAULT_GLOB, 'config.yml'));
  });
});
