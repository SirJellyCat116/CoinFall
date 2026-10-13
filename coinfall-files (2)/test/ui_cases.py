# Two-browser test of levels, cases, free cases and battles. Server on :8790.
import asyncio, random, sys
from playwright.async_api import async_playwright
URL = 'http://localhost:8790/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errors = []
def watch(p, tag):
    p.on('pageerror', lambda e: errors.append(f'{tag} PAGEERR {e}'))
    p.on('console', lambda m: errors.append(f'{tag} CONSOLE {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
async def signup(p, name):
    await p.goto(URL); await p.wait_for_selector('#auth-modal:not([hidden])', timeout=5000)
    await p.fill('#auth-name', name); await p.fill('#auth-pass', 'pass1234'); await p.click('#auth-go')
    await p.wait_for_selector('#me-wrap:not([hidden])', timeout=5000)
async def go(p, v): await p.evaluate(f"location.hash='#{v}'"); await p.wait_for_timeout(400)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        A = await (await b.new_context(viewport={'width': 1440, 'height': 1000})).new_page()
        B = await (await b.new_context(viewport={'width': 400, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)).new_page()
        watch(A, 'A'); watch(B, 'B')
        n = random.randint(100, 999)
        await signup(A, f'Ace{n}'); await signup(B, f'Bea{n}')
        # free case
        await go(A, 'free'); await A.click('[data-free="0"]'); await A.wait_for_timeout(5800)
        await A.screenshot(path=f'{OUT}/c1-free.png')
        # cases grid + open one
        await go(A, 'cases'); await A.wait_for_timeout(300); await A.screenshot(path=f'{OUT}/c2-cases.png')
        await go(A, 'case-5'); await A.wait_for_timeout(400); await A.click('#case-open'); await A.wait_for_timeout(5800)
        await A.screenshot(path=f'{OUT}/c3-case.png')
        # battle 2v2: A creates, B joins, A calls bots
        await go(A, 'battles'); await go(B, 'battles')
        await A.click('[data-mode="2v2"]'); await A.click('#bm-add'); await A.wait_for_timeout(200)
        await A.click('[data-pk="8"][data-d="1"]'); await A.click('[data-pk="12"][data-d="1"]'); await A.click('#picker-done')
        await A.click('#bm-create'); await A.wait_for_timeout(700)
        await B.wait_for_selector('#battle-list [data-bact="join"]', timeout=5000); await B.click('#battle-list [data-bact="join"] >> nth=0'); await B.wait_for_timeout(700)
        await A.screenshot(path=f'{OUT}/c4-battle-open.png')
        await A.click('#battle-view [data-bact="bots"]'); await A.wait_for_timeout(5200)
        await A.screenshot(path=f'{OUT}/c5-battle-run.png')
        await A.wait_for_selector('[data-banner]:not([hidden])', timeout=40000); await A.wait_for_timeout(600)
        await A.screenshot(path=f'{OUT}/c6-battle-done.png')
        await B.screenshot(path=f'{OUT}/c7-battle-mobile.png')
        print('banner:', await A.text_content('[data-banner]'))
        # rewards level card
        await go(A, 'rewards'); await A.wait_for_timeout(400); await A.screenshot(path=f'{OUT}/c8-rewards.png', full_page=True)
        print('level chip:', await A.text_content('#lvl-n'), await A.text_content('#lvl-pct'), '| rake:', await A.text_content('#rake-amt'))
        sw = await B.evaluate('document.documentElement.scrollWidth'); print('mobile scrollWidth', sw)
        print('\n'.join(errors) if errors else 'NO PAGE ERRORS')
        await b.close()
asyncio.run(main())
