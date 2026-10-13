# Two-browser chat + tip check. Server on :8790 with a fresh database.
import asyncio, random, sys
from playwright.async_api import async_playwright
URL = 'http://localhost:8790/'; OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errs = []
async def signup(p, name):
    await p.goto(URL); await p.wait_for_selector('#auth-modal:not([hidden])')
    await p.fill('#auth-name', name); await p.fill('#auth-pass', 'pass1234'); await p.click('#auth-go'); await p.wait_for_selector('#me-wrap:not([hidden])')
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        A = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
        B = await (await b.new_context(viewport={'width': 400, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)).new_page()
        for p, t in ((A, 'A'), (B, 'B')): p.on('pageerror', lambda e, t=t: errs.append(f'{t} {e}'))
        n = random.randint(100, 999); an, bn = f'Ace{n}', f'Bea{n}'
        await signup(A, an); await signup(B, bn)
        await A.click('#chat-btn'); await A.fill('#chat-input', 'hey everyone, gl!'); await A.press('#chat-input', 'Enter'); await A.wait_for_timeout(600)
        print('B unread badge:', await B.text_content('#chat-unread'))
        await B.click('#chat-btn'); await B.wait_for_timeout(300)
        await B.fill('#chat-input', 'hi! www.example.com'); await B.press('#chat-input', 'Enter'); await B.wait_for_timeout(600)
        # A bets 100 so tipping unlocks, then tips B from the name menu
        await A.evaluate("location.hash='#dice'"); await A.wait_for_timeout(300); await A.fill('#dice-bet', '100'); await A.click('#dice-go'); await A.wait_for_timeout(800)
        if float((await A.text_content('#wallet [data-bal]')).replace(',', '')) < 10:
            await A.evaluate("location.hash='#rewards'"); await A.wait_for_timeout(300); await A.click('#daily-btn'); await A.wait_for_timeout(500)
        await A.click(f'#chat-list .cm-name[data-name="{bn}"]'); await A.wait_for_timeout(200)
        await A.click('#name-menu [data-nm="tip"]'); await A.fill('#tip-amt', '10'); await A.click('#tip-send'); await A.wait_for_timeout(900)
        await A.screenshot(path=f'{OUT}/chat-desktop.png'); await B.screenshot(path=f'{OUT}/chat-mobile.png')
        print('B balance after tip:', await B.text_content('#wallet [data-bal]'))
        print('last chat lines A:', [await x.text_content() for x in (await A.locator('#chat-list li').all())[-3:]])
        print('mobile scrollWidth', await B.evaluate('document.documentElement.scrollWidth'))
        print(errs or 'NO PAGE ERRORS'); await b.close()
asyncio.run(main())
