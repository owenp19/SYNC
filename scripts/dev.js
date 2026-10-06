const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const livekitBin = path.join(root, 'infra', 'livekit', 'bin', 'livekit-server.exe');
const livekitYaml = path.join(root, 'infra', 'livekit', 'livekit.yaml');
const livekitBinUnix = path.join(root, 'infra', 'livekit', 'bin', 'livekit-server');

const hasDocker = spawnSync('where', ['docker'], { shell: true }).status === 0;
const livekitPath = fs.existsSync(livekitBin) ? livekitBin : (fs.existsSync(livekitBinUnix) ? livekitBinUnix : null);
const useLocalLivekit = !hasDocker && !!livekitPath;

const tasks = [
  { name: 'backend', cmd: 'npm run dev:backend', color: 'magenta' },
  // Scheduler: ejecuta el barrido de pisos expirados (floor:expire-stale cada 30s)
  { name: 'schedulr', cmd: 'npm run dev:scheduler', color: 'yellow' },
  { name: 'mobile', cmd: 'npm run dev:mobile', color: 'cyan' },
];

if (hasDocker) {
  tasks.unshift({ name: 'infra', cmd: 'npm run dev:infra', color: 'blue' });
} else if (useLocalLivekit) {
  tasks.unshift({
    name: 'livekit',
    cmd: 'scripts\\run-livekit.cmd',
    color: 'blue',
  });
  console.log('[i] Docker no disponible: usando binario local de LiveKit (infra/livekit/bin).');
} else {
  console.log('[!] Sin Docker ni binario LiveKit: corre "node scripts/install-livekit.js" o usa dev:infra.');
}

const quoted = tasks.map(t => `"${t.cmd}"`);
const args = [
  'concurrently', '-k',
  '-n', tasks.map(t => t.name).join(','),
  '-c', tasks.map(t => t.color).join(','),
  ...quoted,
];

spawn('npx', args, { stdio: 'inherit', shell: true, cwd: root });
