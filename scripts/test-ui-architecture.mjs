import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), 'utf8');

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [relative] : [];
  }));
  return nested.flat();
}

const tsconfig = JSON.parse(await read('tsconfig.json'));
const aliases = tsconfig.compilerOptions?.paths ?? {};
assert.deepEqual(aliases['@/auth/auth-provider'], ['./src/ui/passive/auth-provider']);
assert.deepEqual(aliases['@/components/toast'], ['./src/ui/passive/toast']);
assert.deepEqual(aliases['@/data/travel-provider'], ['./src/ui/passive/travel-provider']);
assert.deepEqual(aliases['@/theme/theme-provider'], ['./src/ui/passive/theme-provider']);
assert.deepEqual(aliases['@/utils/confirm-deletion'], ['./src/ui/passive/confirm-deletion']);

const layout = await read('src/app/_layout.tsx');
for (const token of ['<AppMediator>', '<TravelMediator>', '<UiBoundary name="RootView">', '<UiBoundary name="Router">', 'name={`Screen:${pathname}`}', '<ConfirmDeletionBridge />']) {
  assert.ok(layout.includes(token), `Root hierarchy is missing ${token}`);
}

const mediator = await read('src/ui/mediator.tsx');
assert.ok(mediator.includes('path: event.path ?? path'), 'Boundary bubbling must preserve the originating event path');
assert.ok(mediator.includes('path: event.path ?? chain.path'), 'Emitters must preserve an existing event path');

const viewFiles = [
  ...(await sourceFiles('src/app')),
  ...(await sourceFiles('src/auth')),
  ...(await sourceFiles('src/components')),
  ...(await sourceFiles('src/screens')),
];
const directPlatformModules = ['expo-clipboard', 'expo-crypto', 'expo-document-picker', 'expo-file-system', 'expo-sharing', 'expo-web-browser'];
for (const file of viewFiles) {
  if (file === 'src/auth/auth-provider.tsx' || file === 'src/components/toast.tsx' || file === 'src/components/toast.web.tsx') continue;
  const source = await read(file);
  assert.ok(!/from ['"](?:\.\.\/)+data\/travel-provider['"]/.test(source), `${file} bypasses the passive travel adapter`);
  assert.ok(!/from ['"](?:\.\.\/)+auth\/auth-provider['"]/.test(source), `${file} bypasses the passive auth adapter`);
  assert.ok(!/from ['"]\.\/toast['"]/.test(source), `${file} bypasses the passive toast adapter`);
  assert.ok(!/import\s*\{[^}]*(?:\brouter\b|\buseRouter\b|\bRedirect\b|\bLink\b)[^}]*\}\s*from ['"]expo-router['"]/.test(source), `${file} performs Router-owned navigation outside the mediator`);
  assert.ok(!source.includes("from 'expo-router/ui'") && !source.includes('from "expo-router/ui"'), `${file} uses Router-owned tabs outside the mediator`);
  assert.ok(!source.includes("from 'expo-router/unstable-native-tabs'") && !source.includes('from "expo-router/unstable-native-tabs"'), `${file} uses Router-owned native tabs outside the mediator`);
  assert.ok(!/import\s*\{[^}]*(?:\bLinking\b|\bShare\b|\bAlert\b)[^}]*\}\s*from ['"]react-native['"]/.test(source), `${file} invokes a React Native platform effect outside the mediator`);
  for (const moduleName of directPlatformModules) {
    assert.ok(!source.includes(`from '${moduleName}'`) && !source.includes(`from "${moduleName}"`), `${file} imports ${moduleName} outside the mediator`);
  }
  assert.ok(!/\bfetch\s*\(/.test(source), `${file} performs network I/O outside a service or mediator`);
  assert.ok(!source.includes('/v1/'), `${file} embeds an API endpoint instead of using a Presenter/service`);
  assert.ok(!/\brequest(?:Raw)?\s*\(/.test(source), `${file} invokes a generic API request outside a Presenter/service`);
  assert.ok(!/\b(?:localStorage|sessionStorage)\b/.test(source), `${file} accesses browser persistence outside a service or mediator`);
  assert.ok(!source.includes('navigator.storage.persist('), `${file} persists browser storage outside the mediator`);
  assert.ok(!source.includes('serviceWorker.register('), `${file} registers a service worker outside the mediator`);
  assert.ok(!source.includes("postMessage({ type: 'ACTIVATE_UPDATE'"), `${file} activates a PWA update outside the mediator`);
}

const travelView = await read('src/ui/passive/travel-provider.ts');
const travelMediator = await read('src/ui/travel-mediator.tsx');
const travelEvents = [...travelView.matchAll(/'(travel\.[^']+)'/g)].map((match) => match[1]).sort();
const travelEffects = [...travelMediator.matchAll(/'(travel\.[^']+)'\s*:/g)].map((match) => match[1]).sort();
assert.deepEqual(travelEvents, travelEffects, 'Every travel view event must have exactly one mediator effect');

const appMediator = await read('src/ui/app-mediator.tsx');
const authView = await read('src/ui/passive/auth-provider.ts');
const authEvents = [...authView.matchAll(/type:\s*'(auth\.[^']+)'/g)].map((match) => match[1]).sort();
const authEffects = [...appMediator.matchAll(/'(auth\.[^']+)'\s*:/g)].map((match) => match[1]).sort();
assert.deepEqual(authEvents, authEffects, 'Every auth view event must have exactly one mediator effect');

const navigationView = await read('src/ui/navigation.ts');
const navigationEvents = [...navigationView.matchAll(/type:\s*'(navigation\.[^']+)'/g)].map((match) => match[1]).sort();
const navigationEffects = [...appMediator.matchAll(/'(navigation\.[^']+)'\s*:/g)].map((match) => match[1]).sort();
assert.deepEqual(navigationEvents, navigationEffects, 'Every navigation event must have exactly one root mediator effect');

const platformView = await read('src/ui/platform.ts');
const platformEvents = [...platformView.matchAll(/type:\s*'(platform\.[^']+)'/g)].map((match) => match[1]).sort();
const platformEffects = [...appMediator.matchAll(/'(platform\.[^']+)'\s*:/g)].map((match) => match[1]).sort();
assert.deepEqual(platformEvents, platformEffects, 'Every platform event must have exactly one root mediator effect');
assert.ok(appMediator.includes("'dialog.confirmDeletion'"), 'Deletion confirmation must be adjudicated by the root mediator');

console.log('UI architecture checks passed');
