import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface PackageJsonShape {
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command?: string }>;
    viewsWelcome?: Array<{ view?: string; contents?: string }>;
  };
}

function loadPackageJson(): PackageJsonShape {
  const pkgPath = path.resolve(__dirname, '../../../package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  return JSON.parse(raw) as PackageJsonShape;
}

function extractWelcomeCommandLinks(contents: string): string[] {
  const matches = contents.match(/command:([a-z0-9_.-]+)/gi) ?? [];
  return matches.map((m) => m.replace(/^command:/i, ''));
}

suite('ViewsWelcome link wiring', () => {
  test('welcome links target contributed commands with explicit onCommand activation', () => {
    const pkg = loadPackageJson();
    const activationEvents = new Set(pkg.activationEvents ?? []);
    const contributed = new Set(
      (pkg.contributes?.commands ?? [])
        .map((c) => c.command)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    );
    const welcome = (pkg.contributes?.viewsWelcome ?? []).find((v) => v.view === 'noveltools.manuscript');
    assert.ok(welcome?.contents, 'Expected viewsWelcome contents for noveltools.manuscript');

    const links = extractWelcomeCommandLinks(welcome!.contents!);
    assert.ok(links.length > 0, 'Expected at least one command link in viewsWelcome contents');

    for (const commandId of links) {
      assert.ok(
        contributed.has(commandId),
        `viewsWelcome link points to non-contributed command: ${commandId}`
      );
      assert.ok(
        activationEvents.has(`onCommand:${commandId}`),
        `Missing explicit activation event for viewsWelcome command link: onCommand:${commandId}`
      );
    }
  });
});
