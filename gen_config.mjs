import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, 'convert_clash_reference.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

const context = {
  $arguments: { full: true, profile: 'client' },
  console,
  structuredClone,
};

vm.createContext(context);
vm.runInContext(scriptSource, context, { filename: 'convert_clash_reference.js' });

const config = context.main({ proxies: [] });
const yamlStr = yaml.dump(config, { indent: 2, lineWidth: -1 });
console.log(yamlStr);
