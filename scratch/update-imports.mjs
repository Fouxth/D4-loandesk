import fs from 'fs';
import path from 'path';

const rootDir = '/Users/pn/Desktop/Fouxth/debt-tracker-ease';

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(path.join(rootDir, 'src'), []);

const replacements = [
  { from: /@\/components\//g, to: '@/client/components/' },
  { from: /@\/contexts\//g, to: '@/client/contexts/' },
  { from: /@\/hooks\//g, to: '@/client/hooks/' },
  { from: /@\/lib\/format/g, to: '@/client/utils/format' },
  { from: /@\/lib\/loanCalc/g, to: '@/client/utils/loanCalc' },
  { from: /@\/lib\/utils/g, to: '@/client/utils/utils' },
  { from: /@\/lib\//g, to: '@/server/functions/' },
  { from: /@\/services\//g, to: '@/server/services/' },
  { from: /import '\.\/i18n'/g, to: "import '@/client/i18n'" },
  { from: /import '\.\/styles\.css'/g, to: "import '@/client/styles.css'" },
  // Local imports in services
  { from: /from '\.\/db\.server'/g, to: "from '@/server/services/db.server'" },
  { from: /from '\.\/session'/g, to: "from '@/server/functions/session'" },
];

files.forEach(file => {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.mjs')) return;
  
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  replacements.forEach(r => {
    if (r.from.test(content)) {
      content = content.replace(r.from, r.to);
      changed = true;
    }
  });
  
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated: ${path.relative(rootDir, file)}`);
  }
});
