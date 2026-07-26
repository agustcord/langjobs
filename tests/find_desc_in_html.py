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
            const res = await fetch('/jobs/view/4421161249/', { headers: { 'Accept': 'text/html' }, credentials: 'same-origin' });
            const html = await res.text();
            
            const hasFever = html.includes('Fever');
            const hasHeyThere = html.includes('Hey there');
            const hasCreativeMarketing = html.includes('Creative Marketing');
            
            const classes = [];
            const classRegex = /class="([^"]*)"/g;
            let m;
            while ((m = classRegex.exec(html)) !== null) {
                if (m[1].includes('job') || m[1].includes('desc') || m[1].includes('detail')) {
                    classes.push(m[1]);
                }
            }
            
            return {
                htmlLen: html.length,
                hasFever,
                hasHeyThere,
                hasCreativeMarketing,
                classesSample: Array.from(new Set(classes)).slice(0, 20)
            };
        })()
        """
        result = await page.evaluate(js)
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))

asyncio.run(main())
