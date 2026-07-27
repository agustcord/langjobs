import sys
sys.path.append(r"C:\Users\Jonatan Agustín\.gemini\config\skills\brave-control\scripts")
import asyncio
from playwright.async_api import async_playwright
from brave_control import get_ws_url

async def main():
    ws_url = get_ws_url()
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(ws_url)
        context = browser.contexts[0]
        page = None
        for p_tab in context.pages:
            if "linkedin.com/jobs" in p_tab.url:
                page = p_tab
                break
        if not page:
            print("LinkedIn page not found")
            return
        
        js = """
        (async () => {
            const cards = Array.from(document.querySelectorAll('[data-job-id]'));
            const results = [];
            
            for (let i = 0; i < Math.min(cards.length, 10); i++) {
                const card = cards[i];
                const jobId = card.getAttribute('data-job-id');
                const title = (card.querySelector('a') || {}).textContent ? (card.querySelector('a') || {}).textContent.trim() : '';
                const company = (card.querySelector('.artdeco-entity-lockup__subtitle') || {}).textContent ? (card.querySelector('.artdeco-entity-lockup__subtitle') || {}).textContent.trim() : '';
                
                const url = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' + jobId;
                let status = 0;
                let descLen = 0;
                let descLang = 'error';
                let fetchErr = null;
                
                try {
                    const res = await fetch(url);
                    status = res.status;
                    if (res.ok) {
                        const html = await res.text();
                        const match = html.match(/<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/i) ||
                                    html.match(/<div[^>]*id="job-details"[^>]*>([\\s\\S]*?)<\\/div>/i);
                        if (match) {
                            const desc = match[1].replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
                            descLen = desc.length;
                            descLang = window.LangJobsDetector ? window.LangJobsDetector.detectLanguage(desc).lang : 'no-detector';
                        }
                    }
                } catch (e) {
                    fetchErr = e.message;
                }
                
                // Also check what title-only detection gave
                const modality = window.LangJobsSelectors ? window.LangJobsSelectors.extractFromCard(card).modality : 'unknown';
                const titleDet = window.LangJobsDetector ? window.LangJobsDetector.detectLanguage(title + ' ' + company, { modality }) : 'no-detector';
                
                results.push({
                    jobId,
                    title: title.slice(0, 45),
                    company: company.slice(0, 30),
                    modality,
                    titleLang: titleDet.lang,
                    titleIsAmbiguous: titleDet.isAmbiguous || false,
                    guestApiStatus: status,
                    guestDescLen: descLen,
                    guestDescLang: descLang,
                    fetchErr
                });
            }
            
            return results;
        })()
        """
        result = await page.evaluate(js)
        import json
        print("Investigation Result:", json.dumps(result, indent=2, ensure_ascii=False))

asyncio.run(main())
