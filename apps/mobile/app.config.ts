import type { ExpoConfig } from 'expo/config';
import { withAndroidManifest } from 'expo/config-plugins';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

// Expo runs from apps/mobile; use the same root configuration as the servers.
// Only the explicitly public values below enter the Android app configuration.
const rootEnv = resolve(__dirname, '../../.env');
if (existsSync(rootEnv)) loadEnvFile(rootEnv);
const config: ExpoConfig = {
  name:'AuraSpace',slug:'auraspace',version:'2.0.0',scheme:'auraspace',platforms:['android'],orientation:'default',userInterfaceStyle:'light',
  android:{package:'com.auraspace.studio',versionCode:2,permissions:['CAMERA'],predictiveBackGestureEnabled:true},
  plugins:['expo-router',['expo-camera',{cameraPermission:'Allow AuraSpace to photograph your room for a reviewed layout draft.',recordAudioAndroid:false}],['expo-image-picker',{photosPermission:'Choose room photos to review furniture and plan your space.',cameraPermission:'Photograph a room to start a layout.',microphonePermission:false}],'expo-sqlite','expo-secure-store'],
  extra:{apiUrl:process.env.EXPO_PUBLIC_API_URL??'',oidcIssuer:process.env.EXPO_PUBLIC_OIDC_ISSUER??'',oidcClientId:process.env.EXPO_PUBLIC_OIDC_CLIENT_ID??''},
};
export default withAndroidManifest(config,mod=>{const app=mod.modResults.manifest.application?.[0];if(app)app.$['android:usesCleartextTraffic']=process.env.EXPO_PUBLIC_ALLOW_HTTP==='true'?'true':'false';return mod;});
