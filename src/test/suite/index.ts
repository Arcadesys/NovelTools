import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

function findTestFiles(dir: string, pattern: RegExp): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findTestFiles(full, pattern));
    } else if (pattern.test(entry.name)) {
      result.push(full);
    }
  }
  return result;
}

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 15000,
  });

  const testsRoot = path.resolve(__dirname, '..');
  const files = findTestFiles(testsRoot, /\.test\.js$/);

  files.forEach((f) => mocha.addFile(f));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (runErr) {
      reject(runErr);
    }
  });
}
