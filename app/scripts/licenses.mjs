import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'build/licenses');
const cache = path.join(root, 'scripts/license-sources');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const id = (name, version) => `${name.replaceAll('@', '').replaceAll('/', '-')}-${version}`;
const fail = (message) => { throw new Error(`License audit: ${message}`); };
const metaPath = path.join(root, 'build/metafile.json');
if (!fs.existsSync(metaPath)) fail('Run npm run build:web first.');
const meta = json(metaPath);
const lock = json(path.join(root, 'package-lock.json'));
const sources = json(path.join(cache, 'sources.json'));
const packages = new Map();
const embedded = new Map();
const inputs = [...new Set(Object.values(meta.outputs).flatMap((item) => Object.entries(item.inputs || {}).filter(([, info]) => info.bytesInOutput > 0).map(([name]) => name)))].sort();
const external = Object.values(meta.outputs).flatMap((item) => (item.imports || []).filter((entry) => entry.external));
if (external.length) fail(`Unreviewed external resources: ${JSON.stringify(external)}`);

function owner(file) {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = json(manifest);
    // Some packages contain a dist/esm/package.json with only {type: module}.
    if (pkg.name && pkg.version) return { dir, pkg };
  }
  fail(`Cannot identify package for ${file}`);
}

for (const input of inputs) {
  const file = path.resolve(root, input);
  if (!file.startsWith(root + path.sep)) fail(`Input outside project: ${input}`);
  const { dir, pkg } = owner(file);
  if (dir === root) continue;
  if (pkg.name.startsWith('@blocknote/xl-')) fail(`XL package present: ${pkg.name}`);
  if (!['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'MPL-2.0'].includes(pkg.license)) fail(`Unreviewed license ${pkg.license} in ${pkg.name}`);
  const key = relative(dir);
  const record = packages.get(key) || { name: pkg.name, version: pkg.version, license: pkg.license, installedPath: key, inputFiles: [], licenseFiles: [], npmSource: `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').at(-1)}-${pkg.version}.tgz`, integrity: lock.packages[key]?.integrity || null };
  record.inputFiles.push({ path: input, sha256: sha(fs.readFileSync(file)) });
  packages.set(key, record);
  if (!fs.existsSync(file + '.map')) continue;
  const map = json(file + '.map');
  for (const [sourceIndex, source] of (map.sources || []).entries()) {
    if (!source.includes('node_modules/')) continue;
    const name = source.split('node_modules/').at(-1).match(/^(@[^/]+\/[^/]+|[^/]+)/)?.[1];
    const rule = sources.embedded.find((entry) => entry.owner === `${pkg.name}@${pkg.version}` && entry.name === name);
    if (!rule) fail(`Unreviewed prebundled dependency ${name} in ${pkg.name}@${pkg.version}`);
    const contentSHA256 = sha(map.sourcesContent?.[sourceIndex] || '');
    if (rule.sourceHashes && rule.sourceHashes[source] !== contentSHA256) fail(`Changed embedded source requires review: ${source}`);
    if (rule.iconSets && !rule.iconSets.includes(source.split('react-icons/').at(-1).split('/')[0])) fail(`Unreviewed icon set: ${source}`);
    const key = `${rule.name}@${rule.version}`;
    const record = embedded.get(key) || { ...rule, owners: [], evidence: [], licenseFiles: [] };
    if (!record.owners.includes(rule.owner)) record.owners.push(rule.owner);
    if (!record.evidence.some((entry) => entry.map === input + '.map' && entry.source === source)) record.evidence.push({ map: input + '.map', source, contentSHA256 });
    embedded.set(key, record);
  }
}

// Only this generated directory is replaced; no application data or sources are touched.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'sources'), { recursive: true });
function copyNotice(from, destination) {
  const target = path.join(output, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(from, target);
  return { path: destination, sha256: sha(fs.readFileSync(target)) };
}
function cached(file, destination) {
  const spec = sources.files.find((entry) => entry.file === file);
  if (!spec) fail(`Missing provenance for ${file}`);
  const from = path.join(cache, file);
  if (sha(fs.readFileSync(from)) !== spec.sha256) fail(`Cached license changed: ${file}`);
  return { ...copyNotice(from, destination), sourceURL: spec.url };
}
function licenseFiles(dir) {
  const found = [];
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /^(?:licen[cs]e|copying|notice|copyright|authors)(?:[.\-_]|$)/i.test(entry.name)) found.push(file);
    }
  }
  visit(dir);
  return found;
}

for (const [key, record] of packages) {
  const dir = path.join(root, key);
  const label = id(record.name, record.version);
  for (const file of licenseFiles(dir)) record.licenseFiles.push(copyNotice(file, `packages/${label}/${path.relative(dir, file)}`));
  if (!record.licenseFiles.length) {
    const override = sources.overrides.find((entry) => record.name.startsWith(entry.prefix) && record.version === entry.version);
    if (!override) fail(`No license text for ${record.name}@${record.version}`);
    record.licenseFiles.push(cached(override.file, `packages/${label}/LICENSE`));
  }
  const upstream = typeof json(path.join(dir, 'package.json')).repository === 'string' ? json(path.join(dir, 'package.json')).repository : json(path.join(dir, 'package.json')).repository?.url;
  record.repository = upstream || null;
  if (record.license === 'MPL-2.0') {
    if (!record.name.startsWith('@blocknote/') || record.version !== '0.31.3') fail(`Review new MPL source package ${record.name}@${record.version}`);
    record.upstreamSource = `https://github.com/TypeCellOS/BlockNote/tree/v0.31.3/packages/${record.name.split('/')[1]}`;
    record.sourceArchive = `sources/${label}.tar.gz`;
    // Keep the complete installed npm package (src, types, dist, LICENSE, package.json),
    // excluding nested installed dependencies. No third-party code is modified.
    execFileSync('/usr/bin/tar', ['-czf', path.join(output, record.sourceArchive), '--exclude=node_modules', '-C', dir, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    record.sourceArchiveSHA256 = sha(fs.readFileSync(path.join(output, record.sourceArchive)));
  }
}

for (const record of embedded.values()) {
  const label = id(record.name, record.version);
  for (const file of record.files) record.licenseFiles.push(cached(file, `embedded/${label}/${file}`));
}
const assets = sources.assets.map((entry) => ({ ...entry, licenseFiles: entry.files.map((file) => cached(file, `assets/${entry.id}/${file}`)) }));
const inventory = {
  generatedBy: 'scripts/licenses.mjs', format: 1,
  metafileSHA256: sha(fs.readFileSync(metaPath)), lockfileSHA256: sha(fs.readFileSync(path.join(root, 'package-lock.json'))),
  scope: 'esbuild output-contributing inputs; adjacent upstream sourcemaps; reviewed embedded icon sets and archived source font notices',
  packages: [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)),
  embedded: [...embedded.values()].sort((a, b) => a.name.localeCompare(b.name)), assets,
  external, bundledAssetInputs: inputs.filter((file) => /\.(woff2?|ttf|otf|png|jpe?g|svg|webp|gif)$/i.test(file)),
};
fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
fs.copyFileSync(path.join(cache, 'sources.json'), path.join(output, 'source-provenance.json'));

const lines = [
  '# Third-party notices / 第三方声明', '',
  'Generated by `node scripts/licenses.mjs` from the current esbuild metafile and package lock. Do not edit this generated file.', '',
  `本次实际输出涉及 ${inventory.packages.length} 个 npm 包，以及 ${inventory.embedded.length} 项上游预打包依赖。完整机器清单、输入文件摘要、许可原文及来源在随包的 \`licenses/inventory.json\` 和 \`licenses/\` 目录；源码工程内对应 \`build/licenses/\`。`, '',
  '这些组件各自保留原作者的版权与许可，不因包含在本应用中改变。未包含 BlockNote XL 包、付费扩展或候选应用品牌素材。编辑器使用的通用图标另列，不能将其 MIT 包装器误认为所有图标的许可。', '',
  '## BlockNote source availability / 源码获取', '',
  'BlockNote core/react/mantine 0.31.3 are used without source modifications under MPL-2.0. Complete installed npm package archives, excluding nested node_modules, are provided in `licenses/sources/`; each includes the editable source and original license. The exact original npm tarball and upstream tag are linked below. Other application code is not relicensed by this notice.', '',
  ...inventory.packages.filter((entry) => entry.license === 'MPL-2.0').map((entry) => `- ${entry.name} ${entry.version}: \`${entry.sourceArchive}\`; [original npm source](${entry.npmSource}); [upstream source](${entry.upstreamSource}).`), '',
  '## Runtime packages / 实际入包依赖', '',
  '| Package | Version | License | Source |', '| --- | --- | --- | --- |',
  ...inventory.packages.map((entry) => `| ${entry.name} | ${entry.version} | ${entry.license} | [npm archive](${entry.npmSource}) · \`licenses/packages/${id(entry.name, entry.version)}/\` |`), '',
  '## Upstream prebundled dependencies / 上游内嵌代码', '',
  'These are identified from the contributing npm artifacts’ own source maps, with versions checked against their upstream lockfiles. They can be absent from esbuild’s direct package list. Source-map entries may include code removed by later tree shaking; this list deliberately retains their notices.', '',
  '| Component | Version | License | Evidence / source |', '| --- | --- | --- | --- |',
  ...inventory.embedded.map((entry) => `| ${entry.name} | ${entry.version} | ${entry.license} | ${entry.owners.join(', ')} · [source](${entry.url}) |`), '',
  ...inventory.embedded.filter((entry) => entry.note).map((entry) => `- **${entry.name}:** ${entry.note}`), '',
  '## Icons and source-archive fonts / 图标与源码归档字体', '',
  ...assets.map((entry) => `- **${entry.name}** — ${entry.license}. ${entry.note} [Original source](${entry.url}). Notice files: \`licenses/assets/${entry.id}/\`.`), '',
  'The application uses system fonts. The unmodified BlockNote source archive also includes its original Inter font files; their OFL notice is included for that redistribution. No separate font sale, endorsement, trademark permission, or license to another product’s branding is implied.', '',
  '## Verification', '',
  `Metafile SHA-256: \`${inventory.metafileSHA256}\``, '',
  `Lockfile SHA-256: \`${inventory.lockfileSHA256}\``, '',
  'The build fails on unreviewed licenses, missing license text, unexpected prebundled dependencies, BlockNote XL packages, or external bundle imports. Future version changes require a new audit; this inventory does not claim that every future release has the same license.', '',
];
fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), lines.join('\n'));
fs.copyFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), path.join(output, 'THIRD-PARTY-NOTICES.md'));
console.log(`License audit passed: ${inventory.packages.length} npm packages, ${inventory.embedded.length} prebundled components, ${assets.length} asset notices; MPL source archives included.`);
