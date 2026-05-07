const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'assessment-workspace.tsx');
const targetByte = 0x96;
const fallbackByte = 0xb7;
const replacementCharBytes = Buffer.from([0xef, 0xbf, 0xbd]);
const replacement = Buffer.from([0x20, 0x2d, 0x20]); // " - "

const input = fs.readFileSync(filePath);
const offsets = [];

function findSequenceOffsets(buffer, sequence) {
  const found = [];
  for (let i = 0; i <= buffer.length - sequence.length; i += 1) {
    let matches = true;
    for (let j = 0; j < sequence.length; j += 1) {
      if (buffer[i + j] !== sequence[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      found.push(i);
      i += sequence.length - 1;
    }
  }
  return found;
}

for (let i = 0; i < input.length; i += 1) {
  if (input[i] === targetByte) {
    offsets.push(i);
  }
}

let mode = '0x96';
let step = 1;

if (offsets.length === 0) {
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === fallbackByte) {
      offsets.push(i);
    }
  }

  if (offsets.length > 0) {
    mode = '0xB7';
  }
}

if (offsets.length === 0) {
  const replacementOffsets = findSequenceOffsets(input, replacementCharBytes);
  if (replacementOffsets.length === 0) {
    console.log('No 0x96 bytes or UTF-8 replacement bytes found. Replacements made: 0');
    process.exit(0);
  }
  mode = 'U+FFFD-bytes';
  step = replacementCharBytes.length;
  offsets.push(...replacementOffsets);
}

if (mode === '0x96') {
  console.log(`Found 0x96 at byte offsets: ${offsets.join(', ')}`);
} else if (mode === '0xB7') {
  console.log('No raw 0x96 bytes found; using fallback byte 0xB7 detected in file.');
  console.log(`Found 0xB7 at byte offsets: ${offsets.join(', ')}`);
} else {
  console.log('No raw 0x96 bytes found; using fallback for UTF-8 replacement bytes (EF BF BD).');
  console.log(`Found EF BF BD at byte offsets: ${offsets.join(', ')}`);
}

const chunks = [];
let start = 0;

for (const offset of offsets) {
  chunks.push(input.slice(start, offset));
  chunks.push(replacement);
  start = offset + step;
}

chunks.push(input.slice(start));

const output = Buffer.concat(chunks);
fs.writeFileSync(filePath, output);

console.log(`Replacements made: ${offsets.length}`);
console.log(`Wrote fixed file: ${filePath}`);
