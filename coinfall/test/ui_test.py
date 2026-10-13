# Two-browser UI test: run the local server on :8790 first.
import asyncio, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:8790/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
errors = []

def watch(page, tag):
    page.on('pageerror', lambda e: errors.append(f'{tag} PAGEERR {e}'))
    page.on('console', lambda m: errors.append(f'{tag} CONSOLE {m.text}') if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_TUNNEL' not in m.text and 'Failed to load resource' not in m.text else None)

async def signup(page, name):
    await page.goto(URL)
    await page.wait_for_selector('#auth-modal:not([hidden])', timeout=5000)
    await page.fill('#auth-name', name)
    await page.fill('#auth-pass', 'pass1234')
    await page.click('#auth-go')
    await page.wait_for_selector('#me-wrap:not([hidden])', timeout=5000)

async def goto(page, view):
    await page.evaluate(f"location.hash = '#{view}'")
    await page.wait_for_timeout(350)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        A = await (await b.new_context(viewport={'width': 1440, 'height': 960})).new_page()
        B = await (await b.new_context(viewport={'width': 400, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True)).new_page()
        watch(A, 'A'); watch(B, 'B')
        n = random.randint(100, 999)
        await signup(A, f'Ace{n}')
        await signup(B, f'Bea{n}')
        await A.wait_for_timeout(800)
        await A.screenshot(path=f'{OUT}/01-lobby.png')
        print('balance A', await A.text_content('#wallet [data-bal]'))

        # solo games on A
        await goto(A, 'mines'); await A.click('#mines-go'); await A.wait_for_timeout(300)
        await A.click('#mines-grid .tile >> nth=0'); await A.wait_for_timeout(300)
        await goto(A, 'towers'); await A.click('#towers-go'); await A.wait_for_timeout(300)
        await A.click('#tower .trow.cur .ttile >> nth=0'); await A.wait_for_timeout(300)
        await goto(A, 'plinko'); await A.click('#plinko-go'); await A.click('#plinko-go'); await A.wait_for_timeout(2600)
        await goto(A, 'dice'); await A.click('#dice-go'); await A.wait_for_timeout(700)
        await goto(A, 'limbo'); await A.click('#limbo-go'); await A.wait_for_timeout(1200)
        await goto(A, 'keno'); await A.click('#keno-random'); await A.click('#keno-go'); await A.wait_for_timeout(1700)
        await A.screenshot(path=f'{OUT}/02-keno.png')
        await goto(A, 'hilo'); await A.click('#hilo-go'); await A.wait_for_timeout(400)
        await A.click('[data-hl="skip"]'); await A.wait_for_timeout(400)
        await A.screenshot(path=f'{OUT}/03-hilo.png')
        await goto(A, 'wheel'); await A.click('#wheel-go'); await A.wait_for_timeout(3700)
        await A.screenshot(path=f'{OUT}/04-wheel.png')
        await goto(A, 'slots'); await A.click('#slots-go'); await A.wait_for_timeout(2400)
        await A.screenshot(path=f'{OUT}/05-slots.png')
        print('balance A after solo', await A.text_content('#wallet [data-bal]'))

        # roulette, both players
        await goto(A, 'roulette'); await goto(B, 'roulette')
        await A.wait_for_function("document.querySelector('#rl-phase').textContent.startsWith('Place')", timeout=20000)
        await A.click('[data-bet="red"]'); await A.click('[data-bet="n17"]')
        await B.click('[data-bet="black"]')
        await A.wait_for_timeout(600)
        await A.screenshot(path=f'{OUT}/06-roulette-bets.png')
        await A.wait_for_function("document.querySelector('#rl-phase').textContent.startsWith('Next')", timeout=30000)
        await A.wait_for_timeout(300)
        await A.screenshot(path=f'{OUT}/07-roulette-result.png')
        await B.screenshot(path=f'{OUT}/08-roulette-mobile.png', full_page=False)

        # blackjack
        await goto(A, 'blackjack'); await goto(B, 'blackjack')
        await A.click('[data-seat="0"]'); await A.wait_for_timeout(300)
        await B.click('[data-seat="2"]'); await B.wait_for_timeout(300)
        await A.click('#bj-bet'); await B.click('#bj-bet')
        for _ in range(40):
            await A.wait_for_timeout(400)
            for pg in (A, B):
                if await pg.is_enabled('[data-bj="stand"]'):
                    await pg.click('[data-bj="stand"]')
            ph = await A.text_content('#bj-phase')
            if ph.startswith('Results'): break
        await A.wait_for_timeout(300)
        await A.screenshot(path=f'{OUT}/09-blackjack.png')

        # crash
        await goto(A, 'crash'); await goto(B, 'crash')
        await A.wait_for_function("document.querySelector('#crash-go').textContent === 'Place bet'", timeout=30000)
        await A.fill('#crash-auto', '1.5'); await A.click('#crash-go'); await B.click('#crash-go')
        await A.wait_for_function("document.querySelector('#crash-go').textContent.startsWith('Cash out') || document.querySelector('#crash-mult').classList.contains('crashed') || document.querySelector('#crash-go').textContent === 'Cashed out'", timeout=15000)
        await A.wait_for_timeout(900)
        await A.screenshot(path=f'{OUT}/10-crash.png')

        # jackpot
        await goto(A, 'jackpot'); await goto(B, 'jackpot')
        await A.wait_for_function("!document.querySelector('#jp-go').disabled", timeout=30000)
        await A.click('#jp-go'); await B.fill('#jackpot-bet', '2'); await B.click('#jp-go')
        await A.wait_for_timeout(700)
        await A.screenshot(path=f'{OUT}/11-jackpot-open.png')
        await A.wait_for_function("document.querySelector('#jp-msg').textContent.includes('won')", timeout=45000)
        await A.wait_for_timeout(400)
        await A.screenshot(path=f'{OUT}/12-jackpot-done.png')

        # coinflip pvp
        await goto(A, 'coinflip'); await goto(B, 'coinflip')
        await A.click('#cf-create'); await B.wait_for_selector('[data-join]', timeout=5000)
        await B.click('[data-join]'); await A.wait_for_timeout(2200)
        await A.screenshot(path=f'{OUT}/13-coinflip.png')

        # rewards + leaderboard
        await goto(A, 'rewards'); await A.click('#daily-btn'); await A.click('[data-act="rain-join"] >> nth=0'); await A.wait_for_timeout(500)
        await A.screenshot(path=f'{OUT}/14-rewards.png')
        await goto(A, 'leaderboard'); await A.wait_for_timeout(600)
        await A.screenshot(path=f'{OUT}/15-leaderboard.png')
        await goto(B, 'lobby'); await B.wait_for_timeout(500)
        sw = await B.evaluate('document.documentElement.scrollWidth')
        await B.screenshot(path=f'{OUT}/16-mobile-lobby.png')
        print('mobile scrollWidth', sw)
        print('A admin link visible:', await A.is_visible('#side [data-nav="admin"]'))
        print('\n'.join(errors) if errors else 'NO PAGE ERRORS')
        await b.close()

asyncio.run(main())
