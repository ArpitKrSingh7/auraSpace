// Compile TypeScript for Node's test runner and resolve the app's extensionless imports.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL);
      if (
        !/\.[a-z]+$/i.test(url.pathname) &&
        !url.pathname.endsWith('/')
      ) {
        for (const extension of ['.ts', '.tsx'])
          if (existsSync(fileURLToPath(url) + extension)) return next(url.href + extension, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/'))
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          fileName: fileURLToPath(url),
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
