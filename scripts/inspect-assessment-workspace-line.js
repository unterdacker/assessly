const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'assessment-workspace.tsx');
const bytes = fs.readFileSync(filePath);
const text = bytes.toString('utf8');

const lines = text.split(/\r?\n/);
const lineNumber = 132;
const line = lines[lineNumber - 1] || '';

console.log(`Line ${lineNumber}: ${line}`);
console.log('Code points:', Array.from(line).map((ch) => ch.codePointAt(0)));

const marker = Buffer.from('{t("title")}');
const idx = bytes.indexOf(marker);
console.log('Marker byte index:', idx);

if (idx >= 0) {
  const snippet = bytes.slice(idx, idx + 80);
  console.log('Snippet bytes:', Array.from(snippet));
  console.log('Snippet utf8:', snippet.toString('utf8'));
}

let nonAsciiCount = 0;
for (let i = 0; i < bytes.length; i += 1) {
  if (bytes[i] > 0x7f) {
    nonAsciiCount += 1;
  }
}
console.log('Total bytes > 0x7F in file:', nonAsciiCount);
