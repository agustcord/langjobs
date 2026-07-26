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
        
        # Find extensions tab or open it
        ext_page = None
        for p_tab in context.pages:
            if "chrome://extensions" in p_tab.url:
                ext_page = p_tab
                break
        if not ext_page:
            ext_page = await context.new_page()
            await ext_page.goto("chrome://extensions/")
        
        await ext_page.bring_to_front()
        await asyncio.sleep(1)
        
        js_reload = """
        (() => {
            const manager = document.querySelector('extensions-manager');
            if (!manager) return 'no manager';
            const itemList = manager.shadowRoot.querySelector('extensions-item-list');
            if (!itemList) return 'no item list';
            const items = itemList.shadowRoot.querySelectorAll('extensions-item');
            for (const item of items) {
                const name = item.shadowRoot.querySelector('#name');
                if (name && name.textContent.includes('LangJobs')) {
                    const reloadBtn = item.shadowRoot.querySelector('#dev-reload-button');
                    if (reloadBtn) {
                        reloadBtn.click();
                        return 'reloaded LangJobs extension';
                    }
                }
            }
            return 'LangJobs extension item not found';
        })()
        """
        res = await ext_page.evaluate(js_reload)
        print("Extension reload result:", res)
        
        await asyncio.sleep(2)
        
        linkedin_page = None
        for p_tab in context.pages:
            if "linkedin.com/jobs" in p_tab.url:
                linkedin_page = p_tab
                break
        
        if linkedin_page:
            print("Reloading LinkedIn page...")
            await linkedin_page.bring_to_front()
            await linkedin_page.reload()
            
            # Wait 3 seconds for async fetches to finish in background
            await asyncio.sleep(3.5)
            
            js_inspect = """
            (() => {
                const cards = Array.from(document.querySelectorAll('[data-job-id]'));
                return cards.map(c => {
                    const badge = c.querySelector('.llf-badge');
                    const link = c.querySelector('a');
                    return {
                        jobId: c.getAttribute('data-job-id'),
                        title: link ? link.textContent.trim().slice(0, 45) : '',
                        langAttr: c.getAttribute('data-llf-lang'),
                        badgeLabel: badge ? badge.textContent : null
                    };
                });
            })()
            """
            inspect_res = await linkedin_page.evaluate(js_inspect)
            import json
            print("LinkedIn Cards state after guest API auto-fetch:", json.dumps(inspect_res, indent=2, ensure_ascii=False))

asyncio.run(main())
