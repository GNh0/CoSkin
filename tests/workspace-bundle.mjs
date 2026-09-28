import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Windows sandbox paths need explicit workspace resolution inside esbuild tests.
export function workspaceBundle() {
  const workspace = process.cwd();
  return {
    name: 'workspace-bundle',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const directory = args.importer
          ? path.dirname(path.resolve(workspace, args.importer))
          : workspace;
        let resolved = args.path.startsWith('.') || args.path.startsWith('src/')
          ? path.resolve(directory, args.path)
          : require.resolve(args.path, { paths: [directory] });
        if (!fs.existsSync(resolved)) {
          if (fs.existsSync(resolved + '.js')) resolved += '.js';
          else if (fs.existsSync(path.join(resolved, 'index.js')))
            resolved = path.join(resolved, 'index.js');
        }
        if (fs.statSync(resolved).isDirectory()) resolved = require.resolve(resolved);
        if (!resolved.startsWith(workspace + path.sep))
          throw Error('Module outside workspace');
        return { path: path.relative(workspace, resolved).split(path.sep).join('/'), namespace: 'workspace' };
      });
      build.onLoad({ filter: /.*/, namespace: 'workspace' }, (args) => ({
        contents: fs.readFileSync(path.resolve(workspace, args.path), 'utf8'),
        loader: args.path.endsWith('.css') ? 'text' : args.path.endsWith('.json') ? 'json' : args.path.endsWith('.ts') ? 'ts' : 'js',
      }));
    },
  };
}
