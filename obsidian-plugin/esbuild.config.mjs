import esbuild from 'esbuild';
import builtins from 'builtin-modules';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prod = process.argv[2] === 'production';

// Directory where this config file (and the built main.js) lives.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load VAULT_PATH from .env if present
let vaultPath = process.env.VAULT_PATH;
if (!vaultPath) {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of envFile.split('\n')) {
      const match = line.match(/^VAULT_PATH\s*=\s*(.+)/);
      if (match) {
        vaultPath = match[1].trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  } catch {
    // .env not present — that's fine
  }
}

/** Copy plugin output files into the vault so Obsidian picks them up automatically. */
function deployToVault() {
  if (!vaultPath) return;
  const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', 'noveltools');
  fs.mkdirSync(pluginDir, { recursive: true });
  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(pluginDir, file));
    }
  }
  console.log(`[NovelTools] Deployed to ${pluginDir}`);
}

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  plugins: [
    {
      name: 'deploy-to-vault',
      setup(build) {
        build.onEnd(() => deployToVault());
      },
    },
  ],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
