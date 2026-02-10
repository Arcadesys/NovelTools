import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const workspaceFolder = path.resolve(__dirname, '../../test-fixtures/with-index-yaml');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspaceFolder],
    });
  } catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
