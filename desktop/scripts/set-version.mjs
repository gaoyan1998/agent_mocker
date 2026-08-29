// 把 desktop/package.json 的 version 改成指定值。
// electron-builder 用它决定产物文件名和安装包版本号。
// 写成脚本而不是 shell 单行，是为了在 Windows runner 上也能直接跑。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('用法: node scripts/set-version.mjs <version>');
  process.exit(1);
}
// 允许 1.2.3 / 1.2.3-beta.1 这类写法，挡掉明显写错的输入。
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`版本号格式不对: ${version}（示例：1.2.3 或 1.2.3-beta.1）`);
  process.exit(1);
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = version;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`[version] desktop/package.json → ${version}`);
