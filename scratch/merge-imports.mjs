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

files.forEach(file => {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
  
  let content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const importLines = lines.filter(l => l.includes('from "@/lib/services"'));
  
  if (importLines.length > 1) {
    const allImports = [];
    importLines.forEach(line => {
      const match = line.match(/import { (.*?) }/);
      if (match) {
        allImports.push(...match[1].split(',').map(i => i.trim()));
      }
    });
    
    const uniqueImports = [...new Set(allImports)].join(', ');
    const newImportLine = `import { ${uniqueImports} } from "@/lib/services";`;
    
    // Remove old lines and add new one
    let newContent = lines.filter(l => !l.includes('from "@/lib/services"')).join('\n');
    newContent = newImportLine + '\n' + newContent;
    
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Merged imports in: ${path.relative(rootDir, file)}`);
  }
});
