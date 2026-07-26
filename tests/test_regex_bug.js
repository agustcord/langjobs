const selectors = require('../src/selectors.js');
const detector = require('../src/detector.js');
const https = require('https');

const url = 'https://www.linkedin.com/jobs/view/4421161249/';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // 1. Test current extractDescriptionFromHTML
    const currentDesc = selectors.extractDescriptionFromHTML(data);
    const currentLang = detector.detectLanguage(currentDesc);
    console.log('Current extractDescriptionFromHTML length:', currentDesc.length);
    console.log('Current extractDescriptionFromHTML snippet:', currentDesc.slice(0, 150));
    console.log('Current detectLanguage result:', currentLang);

    // 2. Test matching #job-details without non-greedy premature </div> truncation
    let match = data.match(/<div[^>]*id="job-details"[^>]*>([\s\S]*?)<\/article>/i) ||
                data.match(/<div[^>]*id="job-details"[^>]*>([\s\S]*?)<\/section>/i) ||
                data.match(/<div[^>]*id="job-details"[^>]*>([\s\S]*?)<\/main>/i);
    if (!match) {
      // Find index of id="job-details"
      const idx = data.indexOf('id="job-details"');
      if (idx !== -1) {
        const slice = data.slice(idx, idx + 10000);
        console.log('Raw slice from job-details:', slice.slice(0, 300));
      }
    } else {
      const fixedDesc = selectors.cleanText(match[1].replace(/<[^>]+>/g, ' '));
      console.log('\nFixed desc length:', fixedDesc.length);
      console.log('Fixed desc snippet:', fixedDesc.slice(0, 150));
      console.log('Fixed detectLanguage result:', detector.detectLanguage(fixedDesc));
    }
  });
});
