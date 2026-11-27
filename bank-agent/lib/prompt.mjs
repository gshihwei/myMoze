// 帳小簿銀行同步 — terminal prompts; secrets are typed with the echo turned off.
import readline from 'node:readline';

export function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(String(a).trim()); }));
}
export function askHidden(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false; rl._writeToOutput = s => { if (!muted) rl.output.write(s); else if (/[\r\n]/.test(s)) rl.output.write('\n'); else rl.output.write('*'.repeat([...s].length)); };
    rl.question(q, a => { rl.close(); resolve(String(a)); }); muted = true;
  });
}
export const say = s => process.stdout.write(s + '\n');
