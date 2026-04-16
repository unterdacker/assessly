const { isIPv4 } = require('net');

const testIP = '10.0.179.-93';
console.log('IP:', testIP);
console.log('isIPv4:', isIPv4(testIP));
console.log('This IP maps to "unknown" in normalizeIp');
console.log('');
console.log('The "unknown" bucket has a limit of 30 requests, not 300!');
