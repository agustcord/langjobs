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
        
        print("Reloading LinkedIn page...")
        await page.reload()
        await asyncio.sleep(4)
        
        js = """
        (() => {
            const feverCard = document.querySelector('[data-job-id="4421161249"]');
            if (!feverCard) return { error: 'fever card not found' };
            const badge = feverCard.querySelector('.llf-badge');
            return {
                jobId: feverCard.getAttribute('data-job-id'),
                langAttr: feverCard.getAttribute('data-llf-lang'),
                hashAttr: feverCard.getAttribute('data-llf-hash'),
                badgeLabel: badge ? badge.textContent : null,
                badgeColor: badge ? badge.style.backgroundColor : null
            };
        })()
        """
        result = await page.evaluate(js)
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))

asyncio.run(main())
