import fs from 'fs';
import path from 'path';

const rootDir = '/Users/pn/Desktop/Fouxth/debt-tracker-ease/frontend/src';

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

const files = getAllFiles(rootDir, []);

const replacements = [
  { from: /@\/client\//g, to: '@/' },
  { from: /@\/server\/functions\//g, to: '@/lib/services' },
];

files.forEach(file => {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
  
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  replacements.forEach(r => {
    if (r.from.test(content)) {
      content = content.replace(r.from, r.to);
      changed = true;
    }
  });
  
  // Special fix for server function calls that were data: params
  // createCustomer({ data: formData }) -> createCustomer(formData)
  if (content.includes('({ data:')) {
    content = content.replace(/\({ data: (.*?) }\)/g, '($1)');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated: ${path.relative(rootDir, file)}`);
  }
});
