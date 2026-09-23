import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const binName = isWin ? 'pocketbase.exe' : 'pocketbase';
const binPath = path.join(__dirname, binName);

const args = process.argv.slice(2).filter((arg) => {
	if (arg.startsWith('--encryptionEnv=') && !process.env[arg.split('=')[1]]) {
		return false;
	}
	return true;
});

const child = spawn(binPath, args, { stdio: 'inherit', cwd: __dirname });
child.on('exit', (code) => process.exit(code ?? 0));
