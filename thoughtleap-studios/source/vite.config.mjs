import {defineConfig} from './object-atelier-v4/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({root,publicDir:path.join(root,'object-atelier-v4/public'),
 resolve:{alias:[{find:/^three\/addons/,replacement:path.join(root,'object-atelier-v4/node_modules/three/examples/jsm')},{find:/^three$/,replacement:path.join(root,'object-atelier-v4/node_modules/three/build/three.module.js')}]},
 server:{host:'127.0.0.1'},build:{outDir:'dist',emptyOutDir:true}});
