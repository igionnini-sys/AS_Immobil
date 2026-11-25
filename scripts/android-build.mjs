import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const folder = fileURLToPath(new URL('../apps/mobile/android/', import.meta.url));
const task = process.argv[2];
if (!['assembleDebug', 'bundleRelease'].includes(task)) throw new Error('Unsupported Gradle task');
const windows = process.platform === 'win32';
const env = { ...process.env, DEBUG: '' };
const portableJava = fileURLToPath(new URL('../.tools/java/', import.meta.url));
const portableSdk = fileURLToPath(new URL('../.tools/sdk/', import.meta.url));
if (!env.JAVA_HOME && existsSync(portableJava)) {
  const jdk = readdirSync(portableJava).find(name => existsSync(join(portableJava, name, 'bin', windows ? 'java.exe' : 'java')));
  if (jdk) env.JAVA_HOME = join(portableJava, jdk);
}
if (!env.ANDROID_HOME && existsSync(join(portableSdk, 'platforms', 'android-36'))) env.ANDROID_HOME = portableSdk;
if (env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
const wrapper = fileURLToPath(new URL(windows ? '../apps/mobile/android/gradlew.bat' : '../apps/mobile/android/gradlew', import.meta.url));
if (!existsSync(wrapper)) throw new Error('Progetto Android assente: eseguire npm run add --workspace @immobil/mobile, poi npm run android:sync');
// Task dalla whitelist; nessun percorso o comando proveniente dai dati dell'app.
const child = windows
  ? spawn('cmd.exe', ['/d', '/c', '.\\gradlew.bat', task], { cwd: folder, env, stdio: 'inherit', windowsHide: true })
  : spawn('sh', [wrapper, task], { cwd: folder, env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
