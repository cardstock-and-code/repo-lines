/* Windows path and CRLF handling, checked without needing Windows. */
const path = require('path');
// exercise the same normaliser under a forced win32 platform
function makeKey(platform){
  return function pathKey(p){
    if(!p) return '';
    const r = path.resolve(String(p)).replace(/[\\/]+/g,'/').replace(/\/+$/,'');
    return platform === 'win32' ? r.toLowerCase() : r;
  };
}
const kWin = makeKey('win32'), kNix = makeKey('linux');
let fail = 0;
function eq(name, a, b, want=true){
  const got = a === b;
  if(got !== want){ fail++; console.log(`  FAIL  ${name} :: ${a} vs ${b}`); }
  else console.log(`  PASS  ${name}`);
}
// the exact mismatch that would break session matching on Windows
eq('slashes agree',        kWin('C:/dev/rl-portal'),  kWin('C:\\dev\\rl-portal'));
eq('case agrees',          kWin('c:/dev/rl-portal'),  kWin('C:/dev/rl-portal'));
eq('trailing slash agrees',kWin('C:/dev/rl-portal/'), kWin('C:/dev/rl-portal'));
eq('mixed separators',     kWin('C:\\dev/trees\\a'),  kWin('c:/dev/trees/a'));
// and case must STILL matter on linux, where two such dirs can coexist
eq('linux stays case-sensitive', kNix('/home/x/Dev'), kNix('/home/x/dev'), false);
eq('different repos stay different', kWin('C:/dev/a'), kWin('C:/dev/b'), false);

// CRLF from Git for Windows must not end up inside filenames
const raw = "## main...origin/main\r\n M src/periods.js\r\n?? notes.txt\r\n";
const parse = (t) => t.split('\n').filter(Boolean).slice(1).map((l) => l.slice(3));
const cleaned = parse(raw.replace(/\r\n/g, '\n').replace(/\n$/, ''));
eq('crlf stripped from paths', cleaned.some((f) => f.includes('\r')), false);
eq('paths survive intact', cleaned[0], 'src/periods.js');

console.log(fail ? `\n${fail} FAILED` : '\nall path checks passed');
process.exit(fail?1:0);
