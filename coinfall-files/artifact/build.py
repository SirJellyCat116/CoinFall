# Builds the single-file Claude page version of Coinfall from the website sources.
#   python3 artifact/build.py OUTPUT.html
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
pub = root / 'public'
read = lambda p: (root / p).read_text()
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / 'artifact' / 'coinfall.html')

def strip_exports(src):
    names = re.findall(r'^export (?:const|function|class) (\w+)', src, re.M)
    return re.sub(r'^export (const|function|class) ', r'\1 ', src, flags=re.M), names

# shared.js
shared, shared_names = strip_exports(read('public/shared.js'))
# casino.js (server)
casino = read('src/casino.js')
casino = re.sub(r"import \{([^}]*)\} from '../public/shared.js';", lambda m: 'const {' + m.group(1) + '} = SH;', casino, flags=re.S)
casino, _ = strip_exports(casino)
# sound.js
sound, sound_names = strip_exports(read('public/sound.js'))
# solo.js
solo = read('public/solo.js')
solo = re.sub(r"import \{([^}]*)\} from './app.js';", lambda m: 'const {' + m.group(1) + '} = app;', solo, flags=re.S)
solo, solo_names = strip_exports(solo)
# cases.js
cases_js = read('public/cases.js')
cases_js = re.sub(r"import \{([^}]*)\} from './app.js';", lambda m: 'const {' + m.group(1) + '} = app;', cases_js, flags=re.S)
cases_js, cases_names = strip_exports(cases_js)
# app.js
app = read('public/app.js')
for a, b in [
    ("import * as R from './shared.js';", 'const R = SH;'),
    ("import { sfx, Sound } from './sound.js';", 'const { sfx, Sound } = SOUND;'),
    ("export { ", 'const __exports = { '),
    ("Promise.all([import('./solo.js'), import('./cases.js')]).then(([mod, cmod]) =>", 'Promise.resolve().then(() => [soloFactory(__exports), casesFactory(__exports)]).then(([mod, cmod]) =>'),
]:
    assert a in app, a
    app = app.replace(a, b, 1)
assert 'import ' not in re.sub(r'//.*', '', app).replace("import('", ''), 'leftover import in app.js'
local = read('artifact/local.js')

script = f"""(() => {{
'use strict';
const SH = (() => {{
{shared}
return {{ {', '.join(shared_names)} }};
}})();
const {{ CasinoCore }} = (() => {{
{casino}
return {{ CasinoCore }};
}})();
const SOUND = (() => {{
{sound}
return {{ {', '.join(sound_names)} }};
}})();
{local}
const soloFactory = app => {{
{solo}
return {{ {', '.join(solo_names)} }};
}};
const casesFactory = app => {{
{cases_js}
return {{ {', '.join(cases_names)} }};
}};
(() => {{
{app}
}})();
}})();
"""

css = read('public/style.css')
# The Claude page wrapper already pads for the phone's safe areas.
css = css.replace('html{-webkit-text-size-adjust:100%;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}', 'html{-webkit-text-size-adjust:100%}')
css = css.replace('.top{position:sticky;top:0;', '.top{position:sticky;top:env(safe-area-inset-top,0px);')
html = read('public/index.html')
body = html.split('<body>', 1)[1].split('<script type="module"', 1)[0]
fonts = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', html).group(0)

page = f"""<title>Coinfall</title>
<meta name="description" content="A free-to-play casino with fourteen games and coins that drop every hour. No real money.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fonts}
<style>
{css}
</style>
{body}
<script>
{script}
</script>
"""
out.write_text(page)
print('wrote', out, len(page) // 1024, 'KB')
