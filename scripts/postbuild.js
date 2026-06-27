import fs from 'fs';
import path from 'path';

const distDir = './dist';
const files = ['100prints-sdk.es.js', '100prints-sdk.umd.js'];

files.forEach(file => {
  const filePath = path.join(distDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix the specific jspdf multiline template literal that breaks oxc parser
  content = content.replace(/`<<\r?\n`/g, '`<<\\n`');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Successfully fixed template literals in ${file}`);
});
