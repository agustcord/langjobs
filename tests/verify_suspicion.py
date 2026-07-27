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
        
        js_trace = """
        (async () => {
            const cards = Array.from(document.querySelectorAll('[data-job-id]'));
            if (!cards.length) return { error: 'no cards found' };
            const card = cards[0];
            const jobId = card.getAttribute('data-job-id');
            
            // Clear attributes and cache to simulate initial arrival of an ambiguous card
            card.removeAttribute('data-llf-lang');
            card.removeAttribute('data-llf-hash');
            const badgeEl = card.querySelector('.llf-badge');
            if (badgeEl) badgeEl.remove();
            if (window.LangJobsApp) {
                delete window.LangJobsApp.FETCH_CACHE[jobId];
            }
            
            // Step A: Run classify/tagCard BEFORE fetchJobDetail completes (T = 0ms)
            const dataInitial = window.LangJobsApp ? window.LangJobsApp.tagCard(card, null, document) : null;
            const badgeT0 = card.querySelector('.llf-badge') ? card.querySelector('.llf-badge').textContent : null;
            
            // Step B: Wait 500ms for fetchJobDetail background fetch to complete
            await new Promise(r => setTimeout(r, 600));
            
            const badgeT500 = card.querySelector('.llf-badge') ? card.querySelector('.llf-badge').textContent : null;
            const langAttrT500 = card.getAttribute('data-llf-lang');
            
            return {
                jobId,
                title: (card.querySelector('a') || {}).textContent ? (card.querySelector('a') || {}).textContent.trim().slice(0, 50) : '',
                initialLang: dataInitial ? dataInitial.lang : null,
                initialIsAmbiguous: dataInitial ? dataInitial.isAmbiguous : null,
                badgeTextAtT0: badgeT0,
                badgeTextAtT500ms: badgeT500,
                langAttrAtT500ms: langAttrT500
            };
        })()
        """
        result = await page.evaluate(js_trace)
        import json
        print("Trace Result:", json.dumps(result, indent=2, ensure_ascii=False))

asyncio.run(main())
