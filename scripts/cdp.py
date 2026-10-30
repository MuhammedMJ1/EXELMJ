"""A tiny CDP client for driving the REAL EXELMJ window.

Why this and not screenshot-and-click-pixels: devicePixelRatio here is 1.25, so
a coordinate read off a screenshot lands 25% away from where it looks. Every
click below is dispatched at CSS pixels taken from getBoundingClientRect, which
is the only measurement the page and the input system agree on.

Usage from another script:
    from cdp import App
    app = App()
    app.js("...")            # evaluate, returns the value
    app.click_sel("#foo")    # trusted click at the element's centre
    app.shot("name.png")
"""
import base64
import json
import os
import time
import urllib.request

import websocket

PORT = 9222
OUT = os.path.dirname(os.path.abspath(__file__))


class App:
    def __init__(self, timeout=25):
        for _ in range(40):
            try:
                pages = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % PORT))
                # The app's OWN page, by URL. Opening the built-in browser tab
                # adds a second, blank, page target — and picking that one
                # makes every evaluate hang with no error, which reads exactly
                # like the app has frozen.
                page = next(
                    (p for p in pages if p['type'] == 'page' and ('index.html' in p.get('url','') or ':5199' in p.get('url',''))),
                    None
                ) or next(p for p in pages if p['type'] == 'page')
                break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError('no debuggable page')
        self.ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=timeout,
                                              suppress_origin=True)
        self.id = 0

    def send(self, method, **params):
        self.id += 1
        self.ws.send(json.dumps({'id': self.id, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.id:
                if 'error' in msg:
                    raise RuntimeError('%s: %s' % (method, msg['error']))
                return msg.get('result', {})

    # ---- evaluation -------------------------------------------------------
    def js(self, expr, awaited=False):
        r = self.send('Runtime.evaluate', expression=expr, returnByValue=True,
                      awaitPromise=awaited, userGesture=True)
        if r.get('exceptionDetails'):
            d = r['exceptionDetails']
            raise RuntimeError('JS: %s' % (d.get('exception', {}).get('description') or d.get('text')))
        return r.get('result', {}).get('value')

    # ---- input ------------------------------------------------------------
    def rect(self, selector):
        """CSS-pixel centre of the first match, or None."""
        return self.js("""(() => {
          const el = document.querySelector(%s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) return null;
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
        })()""" % json.dumps(selector))

    def _mouse(self, kind, x, y, button='left', clicks=1, modifiers=0):
        self.send('Input.dispatchMouseEvent', type=kind, x=x, y=y, button=button,
                  clickCount=clicks, modifiers=modifiers, buttons=1 if kind == 'mouseMoved' else 0)

    def click(self, x, y, button='left', clicks=1, modifiers=0):
        self.send('Input.dispatchMouseEvent', type='mousePressed', x=x, y=y, button=button,
                  clickCount=clicks, modifiers=modifiers, buttons=1)
        self.send('Input.dispatchMouseEvent', type='mouseReleased', x=x, y=y, button=button,
                  clickCount=clicks, modifiers=modifiers, buttons=0)

    def click_sel(self, selector, **kw):
        r = self.rect(selector)
        if not r:
            return False
        self.click(r['x'], r['y'], **kw)
        return True

    def drag(self, x0, y0, x1, y1, steps=12, modifiers=0):
        self.send('Input.dispatchMouseEvent', type='mousePressed', x=x0, y=y0,
                  button='left', clickCount=1, buttons=1, modifiers=modifiers)
        for i in range(1, steps + 1):
            self.send('Input.dispatchMouseEvent', type='mouseMoved',
                      x=x0 + (x1 - x0) * i / steps, y=y0 + (y1 - y0) * i / steps,
                      button='left', buttons=1, modifiers=modifiers)
        self.send('Input.dispatchMouseEvent', type='mouseReleased', x=x1, y=y1,
                  button='left', clickCount=1, buttons=0, modifiers=modifiers)

    def move(self, x, y):
        self.send('Input.dispatchMouseEvent', type='mouseMoved', x=x, y=y, buttons=0)

    def key(self, code, key=None, modifiers=0, text=None, vk=0):
        # `code`/`key` MUST be strings: handing CDP a number here fails an
        # assertion inside Electron's CBOR reader and takes the whole app down
        # with a V8 fatal error, which reads exactly like an app crash.
        # windowsVirtualKeyCode is what the editor actually acts on for
        # non-printing keys (Delete=46, Backspace=8, Enter=13, Tab=9).
        base = {'code': str(code), 'key': str(key or code), 'modifiers': modifiers,
                'windowsVirtualKeyCode': int(vk)}
        if text is not None:
            base['text'] = str(text)
        self.send('Input.dispatchKeyEvent', type='keyDown', **base)
        self.send('Input.dispatchKeyEvent', type='keyUp', **base)

    # ---- output -----------------------------------------------------------
    def shot(self, name):
        data = self.send('Page.captureScreenshot', format='png')['data']
        path = os.path.join(OUT, name)
        with open(path, 'wb') as f:
            f.write(base64.b64decode(data))
        return path

    def wait(self, seconds=0.35):
        time.sleep(seconds)
