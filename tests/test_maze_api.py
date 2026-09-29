"""Tests for maze.py, the Python API the learner's program calls.

maze.py normally runs inside Pyodide and talks to the page through the ``js``
module, so these tests install a stand-in for ``js`` before importing it. That
stand-in also records the actions that would have been animated, which is what
lets the challenge-mode tests below prove that nothing is drawn and that the
maze on screen is left exactly as it was found.
"""

import contextlib
import importlib
import io
import json
import re
import sys
import threading
import types
import unittest
from pathlib import Path

import maze_generator

PROJECT_ROOT = Path(__file__).resolve().parents[1]


# S faces right. The goal is four moves away: right, right, down, down.
TEST_MAZE = [
    "#####",
    "#S..#",
    "#.#.#",
    "#..G#",
    "#####",
]

RIGHT_HAND_SOLVER = """
while not at_goal():
    if path_right():
        turn_right()
        move()
    elif path_ahead():
        move()
    else:
        turn_left()
"""

SPINS_FOREVER = """
while not at_goal():
    turn_left()
"""

# The strategy the harder difficulties reward: remember every square visited,
# prefer a new one, and back up along the trail at a dead end. It is written
# the way a learner would write it, using only the public API, because its
# cost in lines is what the challenge budgets are measured against.
MEMORY_SOLVER = """
DIRS = [(-1, 0), (0, 1), (1, 0), (0, -1)]
facing = 1
visited = {position()}
trail = []


def is_open(d):
    rel = (d - facing) % 4
    return [path_ahead, path_right, path_behind, path_left][rel]()


def face(d):
    global facing
    rel = (d - facing) % 4
    if rel == 1:
        turn_right()
    elif rel == 2:
        turn_right()
        turn_right()
    elif rel == 3:
        turn_left()
    facing = d


while not at_goal():
    r, c = position()
    for d in range(4):
        nr, nc = r + DIRS[d][0], c + DIRS[d][1]
        if (nr, nc) not in visited and is_open(d):
            face(d)
            move()
            visited.add((nr, nc))
            trail.append(d)
            break
    else:
        face((trail.pop() + 2) % 4)
        move()
"""


def challenge_budgets():
    """Read each difficulty's step budget out of js/challenge.js."""
    source = (PROJECT_ROOT / "js" / "challenge.js").read_text(encoding="utf-8")
    tiers = re.findall(r'\{key: "(\w+)", label: "[^"]*", maxSteps: (\d+)\}', source)
    return {key: int(max_steps) for key, max_steps in tiers}


def install_fake_js(lines):
    """Put a stand-in for Pyodide's ``js`` module on sys.modules."""
    fake = types.ModuleType("js")
    fake.actions = []
    fake.js_enqueue_action = fake.actions.append
    fake.JS_MAZE = list(lines)
    fake.JS_MAZE_NUM_ROWS = len(lines)
    fake.JS_MAZE_NUM_COLS = len(lines[0])
    for marker, row_name, column_name in (
        ("S", "JS_MAZE_START_ROW", "JS_MAZE_START_COL"),
        ("G", "JS_MAZE_GOAL_ROW", "JS_MAZE_GOAL_COL"),
    ):
        row = next(index for index, line in enumerate(lines) if marker in line)
        setattr(fake, row_name, row)
        setattr(fake, column_name, lines[row].index(marker))

    sys.modules["js"] = fake
    return fake


class MazeApiTestCase(unittest.TestCase):
    def setUp(self):
        self.js = install_fake_js(TEST_MAZE)
        # A fresh import per test, because maze.py keeps the player position in
        # module-level state.
        sys.modules.pop("maze", None)
        self.maze = importlib.import_module("maze")
        self.maze.PMG_MAZE_GENERATOR = maze_generator

    def tearDown(self):
        sys.modules.pop("maze", None)
        sys.modules.pop("js", None)


class PlayerMovementTests(MazeApiTestCase):
    def test_player_starts_on_the_start_square_facing_right(self):
        self.assertEqual((self.maze.row, self.maze.col), (1, 1))
        self.assertEqual(self.maze.direction, 1)

    def test_move_advances_and_reports_the_action_for_animation(self):
        self.maze.move()

        self.assertEqual((self.maze.row, self.maze.col), (1, 2))
        self.assertEqual(self.js.actions, ["move"])

    def test_turning_changes_facing_without_moving(self):
        self.maze.turn_right()
        self.maze.turn_right()

        self.assertEqual((self.maze.row, self.maze.col), (1, 1))
        self.assertEqual(self.maze.direction, 3)
        self.assertEqual(self.js.actions, ["turnRight", "turnRight"])

    def test_walking_into_a_wall_explains_which_way_it_failed(self):
        self.maze.turn_left()  # face up, into the border

        with self.assertRaises(RuntimeError) as raised:
            self.maze.move()

        self.assertIn("up", str(raised.exception))
        self.assertIn("path_ahead()", str(raised.exception))

    def test_path_questions_are_relative_to_the_way_it_faces(self):
        self.assertTrue(self.maze.path_ahead())
        self.assertTrue(self.maze.path_right())
        self.assertFalse(self.maze.path_left())

        self.maze.turn_right()  # now facing down

        self.assertTrue(self.maze.path_ahead())
        self.assertTrue(self.maze.path_left())

    def test_position_reports_the_current_square(self):
        self.assertEqual(self.maze.position(), (1, 1))

        self.maze.move()

        self.assertEqual(self.maze.position(), (1, 2))
        # Reporting where it is must not move it or animate anything.
        self.assertEqual(self.js.actions, ["move"])

    def test_at_goal_is_only_true_on_the_goal_square(self):
        self.assertFalse(self.maze.at_goal())

        self.maze.move()
        self.maze.move()
        self.maze.turn_right()
        self.maze.move()
        self.maze.move()

        self.assertTrue(self.maze.at_goal())


class RunProgramTests(MazeApiTestCase):
    """What the Run button reports back about the learner's program."""

    def run_program(self, source, max_steps=5000):
        return json.loads(self.maze.run_program(source, 2.0, max_steps))

    def test_a_working_program_reports_no_error(self):
        result = self.run_program(RIGHT_HAND_SOLVER)

        self.assertEqual(result, {"error": "", "stuck": False})
        self.assertTrue(self.maze.at_goal())

    def test_an_error_only_mentions_the_learners_own_lines(self):
        # Line 2 walks into the top wall. The traceback should point at that
        # line of the learner's code, and at nothing inside this file.
        result = self.run_program("turn_left()\nmove()\n")

        self.assertIn('File "<your program>", line 2, in <module>', result["error"])
        self.assertIn("    move()", result["error"])
        self.assertTrue(
            result["error"].splitlines()[-1].startswith("RuntimeError: Wall ahead")
        )
        self.assertNotIn("maze.py", result["error"])
        self.assertNotIn("run_user_code", result["error"])
        self.assertFalse(result["stuck"])

    def test_the_error_markers_line_up_with_the_code(self):
        # The editor rarely ends in a newline, and Python 3.12 misplaced the
        # ^^^ markers under the last line when it did not.
        result = self.run_program("Move()")

        self.assertIn("    Move()\n    ^^^^\n", result["error"])

    def test_a_syntax_error_points_at_the_learners_line(self):
        result = self.run_program("while not at_goal()\n    move()\n")

        self.assertIn('File "<your program>", line 1', result["error"])
        self.assertIn("SyntaxError", result["error"])
        self.assertNotIn("run_user_code", result["error"])

    def test_an_endless_loop_is_reported_as_stuck(self):
        result = self.run_program(SPINS_FOREVER, max_steps=2000)

        self.assertTrue(result["stuck"])
        self.assertIn(
            "StepLimitError: Stopped after running 2,000 lines", result["error"]
        )
        self.assertNotIn("<locals>", result["error"])

    def run_program_or_fail(self, source, max_steps):
        """Run a program that might never end, and fail rather than hang."""
        results = []
        worker = threading.Thread(
            target=lambda: results.append(self.run_program(source, max_steps)),
            daemon=True,
        )
        worker.start()
        worker.join(10)
        if worker.is_alive():
            self.fail("The program was never stopped: the page would freeze")
        return results[0]

    def test_catching_the_stop_cannot_keep_a_loop_running(self):
        # Wrapping move() in try/except catches the StepLimitError too. The
        # run must end anyway, whichever line the limit happens to land on.
        catches_everything = (
            "while not at_goal():\n"
            "    try:\n"
            "        move()\n"
            "        move()\n"
            "    except Exception:\n"
            "        turn_right()\n"
            "        turn_right()\n"
        )
        for max_steps in range(1000, 1010):
            with self.subTest(max_steps=max_steps):
                self.maze.reset_state()
                result = self.run_program_or_fail(catches_everything, max_steps)
                self.assertTrue(result["stuck"])
                self.assertIn("StepLimitError", result["error"])

    def test_a_loop_written_on_one_line_is_stopped(self):
        result = self.run_program_or_fail("while not at_goal(): turn_left()", 2000)

        self.assertTrue(result["stuck"])

    def test_each_lap_of_a_one_line_loop_counts_as_a_line(self):
        steps = self.maze.run_user_code("for lap in range(100): pass\n", 2.0, 5000)

        self.assertGreaterEqual(steps, 100)

    def test_the_learners_variables_cannot_overwrite_the_game(self):
        # direction, maze, row and col are all names of game state in maze.py,
        # and natural names for a learner to choose for their own variables.
        result = self.run_program(
            "direction = 'right'\nmaze = []\nrow, col = 0, 0\nmove()\n"
        )

        self.assertEqual(result["error"], "")
        self.assertEqual(self.maze.position(), (1, 2))
        self.assertEqual(self.js.actions, ["move"])

    def test_a_last_print_without_a_newline_is_not_held_back(self):
        printed = io.StringIO()
        with contextlib.redirect_stdout(printed):
            self.run_program('print("a")\nprint("b", end="")\n')

        self.assertEqual(printed.getvalue(), "a\nb\n")

    def test_block_highlights_are_queued_in_step_with_the_moves(self):
        # Blocks mode lights up each block when the animation reaches it, so
        # the highlight has to sit in the same queue as the moves.
        self.run_program("_highlight_block('a')\nmove()\n_highlight_block('b')\n")

        self.assertEqual(self.js.actions, ["highlight:a", "move", "highlight:b"])

    def test_each_run_starts_with_none_of_the_last_runs_variables(self):
        self.run_program("remembered = 1\n")

        result = self.run_program("print(remembered)\n")

        self.assertIn("NameError", result["error"])


class ChallengeRunTests(MazeApiTestCase):
    def run_challenge(self, source, level="easy", seed=1, max_steps=15000):
        return json.loads(
            self.maze.run_challenge_maze(source, level, seed, max_steps, 2.0)
        )

    def test_a_correct_solver_reaches_the_goal(self):
        result = self.run_challenge(RIGHT_HAND_SOLVER)

        self.assertTrue(result["reached"])
        self.assertEqual(result["reason"], "reached")
        self.assertGreaterEqual(result["moves"], result["shortest"])
        self.assertEqual(result["level"], "easy")
        self.assertEqual(result["seed"], 1)

    def test_the_lines_a_program_used_are_reported(self):
        # Challenge mode sets each difficulty's budget from this figure, so a
        # solved maze has to report what it actually cost.
        result = self.run_challenge(RIGHT_HAND_SOLVER)

        self.assertGreater(result["steps"], result["moves"])
        self.assertLess(result["steps"], 15000)

    def test_the_same_seed_always_gives_the_same_maze(self):
        first = self.run_challenge(RIGHT_HAND_SOLVER)
        second = self.run_challenge(RIGHT_HAND_SOLVER)

        self.assertEqual(first["maze"], second["maze"])

    def test_a_program_that_never_finishes_is_reported_as_stuck(self):
        result = self.run_challenge(SPINS_FOREVER, max_steps=2000)

        self.assertFalse(result["reached"])
        self.assertEqual(result["reason"], "stuck")

    def test_a_broken_program_is_reported_as_an_error(self):
        result = self.run_challenge("move(")

        self.assertFalse(result["reached"])
        self.assertEqual(result["reason"], "error")
        self.assertIn("SyntaxError", result["error"])

    def test_nothing_is_animated_during_a_challenge_run(self):
        self.run_challenge(RIGHT_HAND_SOLVER)

        self.assertEqual(self.js.actions, [])

    def test_the_displayed_maze_and_player_are_left_untouched(self):
        self.maze.move()  # the learner has already moved on the shown maze
        before = (
            list(self.maze.maze),
            self.maze.num_rows,
            self.maze.num_cols,
            self.maze.start_row,
            self.maze.start_col,
            self.maze.goal_row,
            self.maze.goal_col,
            self.maze.row,
            self.maze.col,
            self.maze.direction,
        )

        self.run_challenge(RIGHT_HAND_SOLVER)

        after = (
            list(self.maze.maze),
            self.maze.num_rows,
            self.maze.num_cols,
            self.maze.start_row,
            self.maze.start_col,
            self.maze.goal_row,
            self.maze.goal_col,
            self.maze.row,
            self.maze.col,
            self.maze.direction,
        )
        self.assertEqual(before, after)
        self.assertIs(self.maze.js_enqueue_action, self.js.js_enqueue_action)

    def test_state_is_restored_even_when_the_program_raises(self):
        before = (list(self.maze.maze), self.maze.row, self.maze.col)

        self.run_challenge("raise ValueError('boom')")

        self.assertEqual((list(self.maze.maze), self.maze.row, self.maze.col), before)
        self.assertIs(self.maze.js_enqueue_action, self.js.js_enqueue_action)

    def test_a_memory_solver_fits_every_challenge_budget(self):
        # Too tight a budget fails a correct program, which teaches the
        # opposite of the lesson. This has happened twice, so measure it.
        budgets = challenge_budgets()
        self.assertEqual(set(budgets), set(maze_generator.DIFFICULTIES))

        for level, max_steps in budgets.items():
            for seed in range(1, 26):
                with self.subTest(level=level, seed=seed):
                    result = self.run_challenge(MEMORY_SOLVER, level, seed, max_steps)
                    self.assertTrue(result["reached"], result["error"])


if __name__ == "__main__":
    unittest.main()
