import { generateConfig } from './convert_clash_reference.js';
import yaml from 'js-yaml';

const config = generateConfig({ full: true, profile: 'client' });
const yamlStr = yaml.dump(config, { indent: 2, lineWidth: -1 });
console.log(yamlStr);
