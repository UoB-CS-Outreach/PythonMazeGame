"""The activity in a real browser: tutorials, Stop, challenge mode and blocks.

See conftest.py for what these need and how to run them.
"""

import pytest

RIGHT_HAND_BLOCKS = """[{untilGoal: [{
    if: "right",
    do: ["turn_right", "move"],
    else: [{if: "ahead", do: ["move"], else: ["turn_left"]}],
}]}]"""

SPINS_FOREVER = "while not at_goal():\n    turn_left()\n"


def pick_tutorial(page, track):
    page.evaluate(f"T.$('[data-tutorial-mode=\"{track}\"]').click()")


def work_through(page, stop_at=None):
    """
    Go through the open tutorial as a learner who does what each card asks.

    Every hint is opened, since that is what reveals the last card's
    example, and a card that asks for a run gets its own example run. Stops
    on the card titled ``stop_at``, or after the last card. Returns the
    titles of the cards seen.
    """
    page.evaluate("T.$('#speed').value = T.$('#speed').max")
    titles = []
    for _ in range(15):
        card = page.evaluate("T.card()")
        if not card["shown"] or card["title"] == stop_at:
            break
        titles.append(card["title"])

        while page.evaluate("!T.$('#tutorialHintBtn').hidden"):
            assert page.evaluate("T.click('#tutorialHintBtn')") == "clicked"
        if page.evaluate("!T.$('#tutorialInsertCodeBtn').hidden"):
            assert page.evaluate("T.click('#tutorialInsertCodeBtn')") == "clicked"

        if not card["nextEnabled"] or card["title"] == "Your turn":
            result = page.evaluate("T.run()")
            assert not result["hadError"], card["title"]
            if result["reached"]:
                page.wait_for_function("T.$('#goalDialog').open", timeout=20000)
                page.evaluate("T.$('#goalDialogLater').click()")
            assert page.evaluate("T.card().nextEnabled"), card["title"]

        assert page.evaluate("T.click('#tutorialNextBtn')") == "clicked", card
    return titles


@pytest.mark.parametrize("track", ["blocks", "programming", "python"])
def test_every_tutorial_track_can_be_finished(page, track):
    # Each run card's own example has to pass its own check, and the last
    # card's example has to reach the goal.
    pick_tutorial(page, track)

    titles = work_through(page)

    assert titles[-1] in ("Your turn", "Then go and break it")
    assert not page.evaluate("T.card().shown")
    assert not page.evaluate("T.$('#challenge-mode').hidden")


def test_cancelling_the_tutorial_picker_keeps_a_passed_step(page):
    pick_tutorial(page, "programming")
    work_through(page, stop_at="Now run it")
    page.evaluate("T.run()")
    assert page.evaluate("T.card().nextEnabled")

    page.evaluate("T.$('#tutorialsBtn').click(); T.$('#closeTutorialSelector').click()")

    card = page.evaluate("T.card()")
    assert card["shown"]
    assert card["nextEnabled"]
    assert card["feedback"].startswith("Completed")


def test_stop_with_nothing_running_keeps_the_tutorial_hint(page):
    pick_tutorial(page, "programming")
    work_through(page, stop_at="Now run it")
    page.evaluate("T.$('#code').value = 'turn_left()'; T.run()")
    hint = page.evaluate("T.card().feedback")

    assert page.evaluate("T.click('#stopBtn')") == "clicked"

    assert page.evaluate("T.card().feedback") == hint


def test_stop_halts_a_run_and_the_card_asks_for_another(page):
    pick_tutorial(page, "programming")
    work_through(page, stop_at="Now run it")
    page.evaluate("T.click('#runBtn')")
    page.wait_for_function("T.card().feedback === 'Program running…'")

    page.wait_for_timeout(300)
    assert page.evaluate("T.click('#stopBtn')") == "clicked"

    card = page.evaluate("T.card()")
    assert page.evaluate("T.$('#output').value") == "Stopped.\n"
    assert card["feedback"] == "Run the program to complete this step."
    assert not card["nextEnabled"]


def test_a_program_that_catches_the_stop_is_still_stopped(page):
    # Python switches a trace function off once it raises, so this program
    # used to catch the step limit and freeze the page for good.
    page.evaluate("T.$('#tutorialSelector').close()")
    page.evaluate(
        "code => T.$('#code').value = code",
        "while not at_goal():\n    try:\n        move()\n        move()\n"
        "    except Exception:\n        turn_right()\n        turn_right()\n",
    )

    # Waited for with a time limit, so a frozen page fails rather than hangs.
    page.evaluate("void T.run().then(result => { window.lastRun = result; })")
    page.wait_for_function("window.lastRun", timeout=30000)

    assert page.evaluate("window.lastRun.stuck")
    assert "StepLimitError" in page.evaluate("T.$('#output').value")


def test_exit_ends_the_program_without_a_traceback(page):
    page.evaluate("T.$('#tutorialSelector').close()")
    page.evaluate("T.$('#code').value = 'move()\\nexit()\\nmove()'")

    result = page.evaluate("T.run()")

    assert not result["hadError"]
    assert result["actions"] == ["move"]
    assert "Traceback" not in page.evaluate("T.$('#output').value")


def test_the_goal_popup_challenge_moves_the_tutorial_aside(page):
    # On the last card the tutorial's backdrop covers the challenge panel,
    # so the challenge could not be stopped or its result used.
    pick_tutorial(page, "blocks")
    work_through(page, stop_at="Your turn")
    page.evaluate(f"mazeBlocks.load({RIGHT_HAND_BLOCKS})")
    page.evaluate("T.$('#speed').value = T.$('#speed').max; T.run()")
    page.wait_for_function("T.$('#goalDialog').open", timeout=20000)

    page.evaluate("T.$('#goalDialogAction').click()")

    assert page.evaluate("challengeMode.isRunning()")
    assert page.evaluate("T.$('#tutorialBackdrop').hidden")
    assert page.evaluate("T.click('.challenge-stop')") == "clicked"
    assert page.evaluate("T.click('#resumeTutorialBtn')") == "clicked"
    assert page.evaluate("T.card().title") == "Your turn"


def test_run_stays_off_until_the_challenge_has_finished(page):
    # Starting a tutorial loads the tutorial maze, and the end of that load
    # used to switch Run back on in the middle of the challenge.
    page.evaluate("T.$('#tutorialSelector').close()")
    page.evaluate("code => T.$('#code').value = code", SPINS_FOREVER)
    page.evaluate("mazeGame.loadPreset('easy')")
    page.wait_for_function("T.$('#mazeSelect').value === 'easy'")
    page.evaluate("challengeMode.unlock(); setTimeout(challengeMode.run)")
    page.wait_for_function("challengeMode.isRunning()")

    page.evaluate("T.$('#tutorialsBtn').click()")
    pick_tutorial(page, "programming")
    page.wait_for_function("T.$('#mazeSelect').value === 'tutorial'")

    assert page.evaluate("challengeMode.isRunning()")
    assert page.evaluate("T.$('#runBtn').disabled")
    assert page.evaluate("T.$('#mazeSelect').disabled")
    page.evaluate("challengeMode.stop()")
    page.wait_for_function("!challengeMode.isRunning()", timeout=30000)
    assert not page.evaluate("T.$('#runBtn').disabled")


def test_a_late_blocks_editor_still_gets_the_tutorial_example(open_app):
    # On a slow connection a visitor can pick Code blocks before Blockly
    # has arrived. Here Blockly is held back until the test lets it through.
    held = []

    def hold_blockly(page):
        page.route("**/blockly_compressed.js", lambda route: held.append(route))

    page = open_app(before_load=hold_blockly, wait_for_blocks=False)
    pick_tutorial(page, "blocks")
    page.evaluate("T.$('#tutorialNextBtn').click()")

    assert page.evaluate("T.$('#blocksEditor').innerText.trim()") == (
        "Loading code blocks…"
    )
    held[0].continue_()
    page.wait_for_function("globalThis.mazeBlocks", timeout=60000)
    assert page.evaluate("mazeBlocks.python()") == "move()\nmove()\n"


def test_convert_to_python_asks_before_replacing_code(page):
    answers = []
    page.on("dialog", lambda dialog: answers.pop(0)(dialog))
    page.evaluate("T.$('#tutorialSelector').close()")
    page.evaluate("T.$('#code').value = 'print(1)'; mazeGame.setMode('blocks')")
    page.evaluate("mazeBlocks.load(['move', 'turn_right'])")

    answers.append(lambda dialog: dialog.dismiss())
    page.evaluate("T.click('#convertBtn')")
    assert page.evaluate("mazeGame.getMode()") == "blocks"
    assert page.evaluate("T.$('#code').value") == "print(1)"

    answers.append(lambda dialog: dialog.accept())
    page.evaluate("T.click('#convertBtn')")
    assert page.evaluate("mazeGame.getMode()") == "python"
    assert page.evaluate("T.$('#code').value").endswith("move()\nturn_right()\n")
    assert answers == []


def test_the_page_fits_a_phone_screen(open_app):
    page = open_app(width=375, height=812)
    page.evaluate("T.$('#tutorialSelector').close()")

    assert page.evaluate("document.documentElement.scrollWidth") <= 375
    assert page.evaluate("T.click('#tutorialsBtn')") == "clicked"
