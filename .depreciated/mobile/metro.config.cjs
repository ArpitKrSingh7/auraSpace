const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Shared mesh components must use the Android app's React instance, not Next's.
const threeRoot=path.dirname(path.dirname(require.resolve('three',{paths:[__dirname]})));
const reactRoot=path.dirname(require.resolve('react/package.json',{paths:[__dirname]}));
config.resolver.resolveRequest=(context,moduleName,platform)=>{
  if(moduleName==='react'||moduleName.startsWith('react/'))return context.resolveRequest(context,path.join(reactRoot,moduleName==='react'?'index.js':moduleName.slice(6)),platform);
  if(moduleName==='three'||moduleName.startsWith('three/'))return context.resolveRequest(context,moduleName==='three'?path.join(threeRoot,'build/three.cjs'):path.join(threeRoot,moduleName.slice(6)),platform);
  return context.resolveRequest(context,moduleName,platform);
};
module.exports=config;
