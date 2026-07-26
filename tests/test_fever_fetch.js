const detector = require('../src/detector.js');
const selectors = require('../src/selectors.js');
const https = require('https');

// Read or fetch the job view HTML for 4421161249
const url = 'https://www.linkedin.com/jobs/view/4421161249/';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTML Status:', res.statusCode);
    console.log('HTML Length:', data.length);
    const desc = selectors.extractDescriptionFromHTML(data);
    console.log('Extracted Desc Length:', desc.length);
    console.log('Extracted Desc Snippet:', desc.slice(0, 300));
    const langRes = detector.detectLanguage(desc);
    console.log('Lang Result:', langRes);
  });
}).on('error', (err) => {
  console.error('Fetch error:', err.message);
});
