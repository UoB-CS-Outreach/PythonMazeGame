"""Browser tests: the page itself, driven through Microsoft Edge by Playwright.

The tests in tests/ cover the Python. These cover what only the page can
show: the tutorial cards, Stop, the challenge panel and code blocks, with
learners' programs running for real in Pyodide. They need the playwright
package, Microsoft Edge (already on Windows PCs, so nothing else has to be
downloaded) and internet access to jsDelivr for Pyodide and Blockly::

    py -m pip install pytest playwright
    py -m pytest browser_tests

Without playwright or Edge they are skipped. A full run takes two or three
minutes, most of it tutorial animations, which play slowly on purpose.
"""

import functools
import http.server
import threading
from pathlib import Path

import pytest

try:
    from playwright import sync_api
except ImportError:
    # Each test skips itself instead: a conftest that skips on import stops
    # pytest altogether when it is pointed at this folder.
    sync_api = None

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Python has loaded when the Run button stops saying "Loading Python…".
PYTHON_READY = (
    "globalThis.mazeGame && "
    "document.getElementById('runBtn').textContent.trim() === 'Run program'"
)

# Small helpers for the tests, installed into each page.
HELPERS = r"""
window.T = {
    $: selector => document.querySelector(selector),

    // Click the way a person would: only if nothing covers the element, as
    // the tutorial backdrop covers everything but the highlighted controls.
    // element.click() alone would press buttons no one could reach.
    click(selector) {
        const element = document.querySelector(selector);
        element.scrollIntoView({block: "center"});
        const box = element.getBoundingClientRect();
        if (box.width === 0) return `${selector} is not visible`;
        const top = document.elementFromPoint(
            box.left + box.width / 2, box.top + box.height / 2);
        if (!(top === element || element.contains(top))) {
            return `${selector} is covered by ${top?.id || top?.className}`;
        }
        element.click();
        return "clicked";
    },

    // Press Run and resolve with the "maze:run-complete" details.
    run() {
        const done = new Promise(resolve => document.addEventListener(
            "maze:run-complete", event => resolve(event.detail), {once: true}));
        const clicked = T.click("#runBtn");
        return clicked === "clicked" ? done : Promise.reject(new Error(clicked));
    },

    card() {
        const feedback = T.$("#tutorialFeedback");
        return {
            title: T.$("#tutorialStepTitle").textContent,
            feedback: feedback.hidden ? "" : feedback.textContent,
            nextEnabled: !T.$("#tutorialNextBtn").disabled,
            shown: !T.$("#tutorialCoachmark").hidden,
        };
    },
};
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


@pytest.fixture(scope="session")
def site_url():
    handler = functools.partial(QuietHandler, directory=str(PROJECT_ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/"
    server.shutdown()


@pytest.fixture(scope="session")
def browser_context():
    if sync_api is None:
        pytest.skip("playwright is not installed")
    # One context for the whole run, so Pyodide is downloaded only once.
    with sync_api.sync_playwright() as playwright:
        try:
            browser = playwright.chromium.launch(channel="msedge")
        except sync_api.Error as error:
            pytest.skip(f"Microsoft Edge could not be started: {error}")
        context = browser.new_context()
        yield context
        browser.close()


@pytest.fixture
def open_app(browser_context, site_url):
    """
    Open the activity and wait for Python to load.

    ``before_load`` gets the page before it loads, to slow a download down,
    for example. The tutorial picker is left open, as a visitor finds it.
    Any uncaught error on the page fails the test.
    """
    pages = []
    errors = []

    def open_page(width=1366, height=768, before_load=None, wait_for_blocks=True):
        page = browser_context.new_page()
        pages.append(page)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.set_viewport_size({"width": width, "height": height})
        if before_load:
            before_load(page)
        # Not waiting for the load event, which a held-back script delays.
        page.goto(site_url, wait_until="commit")
        page.wait_for_function(PYTHON_READY, timeout=120000)
        if wait_for_blocks:
            page.wait_for_function("globalThis.mazeBlocks", timeout=60000)
        page.evaluate(HELPERS)
        return page

    yield open_page

    for page in pages:
        page.close()
    assert errors == []


@pytest.fixture
def page(open_app):
    return open_app()
