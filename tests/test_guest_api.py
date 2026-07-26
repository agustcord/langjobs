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
            const jobId = '4421161249';
            const url = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' + jobId;
            const res = await fetch(url);
            const html = await res.text();
            
            function cleanText(t) {
                return (t || '').replace(/ /g, ' ').replace(/\\s+/g, ' ').trim();
            }
            
            function extractDescriptionFromHTML(htmlString) {
                if (!htmlString || typeof htmlString !== 'string') return '';
                const match = htmlString.match(/<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/i) ||
                            htmlString.match(/<div[^>]*id="job-details"[^>]*>([\\s\\S]*?)<\\/div>/i) ||
                            htmlString.match(/<section[^>]*class="[^"]*description[^"]*"[^>]*>([\\s\\S]*?)<\\/section>/i);
                if (!match) return '';
                const cleaned = cleanText(match[1].replace(/<[^>]+>/g, ' '));
                if (cleaned.length < 50) return '';
                return cleaned;
            }
            
            const desc = extractDescriptionFromHTML(html);
            return {
                status: res.status,
                htmlLen: html.length,
                descLen: desc.length,
                descSnippet: desc.slice(0, 300)
            };
        })()
        """
        result = await page.evaluate(js)
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))

asyncio.run(main())
