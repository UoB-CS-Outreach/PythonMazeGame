"""Tests for generated mazes and the checked-in maze collection."""

import unittest
from pathlib import Path

from maze_generator import (
    DIFFICULTIES,
    count_junctions,
    count_passage_loops,
    find_solution,
    generate_difficulty,
    generate_maze,
    validate_maze,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# 0 = up, 1 = right, 2 = down, 3 = left, matching maze.py.
DIRECTIONS = [(-1, 0), (0, 1), (1, 0), (0, -1)]

# The strategies taught in the Beginner Guide, as (relative direction to try,
# whether to turn that way first) pairs. The final fallback is turning left.
FORWARD_FIRST_RULE = (0, 1)
RIGHT_HAND_RULE = (1, 0)


def solve_with_rule(maze, rule, step_limit=20000):
    """Return True if a relative-direction rule reaches the goal.

    This mirrors the maze API available to participants: the player starts on
    ``S`` facing right and can only ask about the squares around it.
    """
    positions = {
        character: (row, column)
        for row, line in enumerate(maze)
        for column, character in enumerate(line)
        if character in "SG"
    }
    row, column = positions["S"]
    direction = 1

    def path_open(offset):
        row_delta, column_delta = DIRECTIONS[(direction + offset) % 4]
        next_row, next_column = row + row_delta, column + column_delta
        return maze[next_row][next_column] != "#"

    for _ in range(step_limit):
        if (row, column) == positions["G"]:
            return True

        for offset in rule:
            if not path_open(offset):
                continue
            direction = (direction + offset) % 4
            row_delta, column_delta = DIRECTIONS[direction]
            row, column = row + row_delta, column + column_delta
            break
        else:
            direction = (direction - 1) % 4

    return False


def count_dead_ends(maze):
    rows, columns = len(maze), len(maze[0])
    return sum(
        sum(
            maze[row + row_delta][column + column_delta] != "#"
            for row_delta, column_delta in DIRECTIONS
            if 0 <= row + row_delta < rows and 0 <= column + column_delta < columns
        )
        == 1
        for row in range(rows)
        for column in range(columns)
        if maze[row][column] != "#"
    )


class MazeGeneratorTests(unittest.TestCase):
    def test_generation_is_reproducible_for_a_seed(self):
        first = generate_maze(15, 21, seed=2026)
        second = generate_maze(15, 21, seed=2026)
        different = generate_maze(15, 21, seed=2027)

        self.assertEqual(first, second)
        self.assertNotEqual(first, different)

    def test_perfect_maze_is_solvable_and_fully_connected(self):
        maze = generate_maze(21, 31, seed=42, style="perfect")

        validate_maze(maze, require_all_passages_connected=True)
        self.assertIsNotNone(find_solution(maze))

    def test_braided_maze_adds_loops_and_stays_connected(self):
        perfect = generate_maze(21, 31, seed=42, style="perfect")
        braided = generate_maze(21, 31, seed=42, style="braided", braid=1.0)

        validate_maze(braided, require_all_passages_connected=True)
        self.assertLess(
            sum(line.count("#") for line in braided),
            sum(line.count("#") for line in perfect),
        )

    def test_braided_maze_always_contains_a_loop(self):
        for seed in range(30):
            with self.subTest(seed=seed):
                maze = generate_maze(11, 11, seed=seed, style="braided", braid=0.05)
                self.assertGreaterEqual(count_passage_loops(maze), 1)

    def test_rooms_open_space_and_need_a_braided_maze(self):
        without_rooms = generate_maze(21, 31, seed=7, style="braided")
        with_rooms = generate_maze(21, 31, seed=7, style="braided", rooms=3)

        self.assertLess(
            sum(line.count("#") for line in with_rooms),
            sum(line.count("#") for line in without_rooms),
        )
        with self.assertRaisesRegex(ValueError, "open rooms"):
            generate_maze(21, 31, style="perfect", rooms=2)

    def test_random_blocks_style_always_has_a_route(self):
        for seed in range(25):
            with self.subTest(seed=seed):
                maze = generate_maze(
                    18, 24, seed=seed, style="blocks", block_density=0.72
                )
                self.assertIsNotNone(find_solution(maze))

    def test_invalid_carved_dimensions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "odd dimensions"):
            generate_maze(10, 11, style="perfect")

    def test_unknown_difficulty_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unknown difficulty"):
            generate_difficulty("impossible")

    def test_checked_in_maps_are_valid(self):
        for path in sorted((PROJECT_ROOT / "mazes").glob("*.txt")):
            with self.subTest(map=path.name):
                maze = path.read_text(encoding="utf-8").splitlines()
                validate_maze(maze)


class CheckedInPresetTests(unittest.TestCase):
    """The maze each difficulty loads must have that difficulty's structure.

    The presets are generated by hand from the command line, so nothing else
    stops a regenerated file from being built with the wrong flags. That is
    not hypothetical: an earlier easy maze contained junctions, which quietly
    broke the simple strategy the guide teaches for it.
    """

    PRESETS = {
        "easy_winding.txt": "easy",
        "medium_crossroads.txt": "medium",
        "hard_switchbacks.txt": "hard",
        "expert_archipelago.txt": "expert",
        "plaza_pillars.txt": "plaza",
        "marathon_sprawl.txt": "marathon",
    }

    def load(self, name):
        path = PROJECT_ROOT / "mazes" / name
        return path.read_text(encoding="utf-8").splitlines()

    def test_presets_match_their_difficulty_size(self):
        for name, level in self.PRESETS.items():
            with self.subTest(map=name):
                maze = self.load(name)
                preset = DIFFICULTIES[level]
                self.assertEqual(len(maze), int(preset["rows"]))
                self.assertEqual(len(maze[0]), int(preset["columns"]))

    def test_easy_preset_is_a_single_corridor(self):
        maze = self.load("easy_winding.txt")
        self.assertEqual(count_junctions(maze), 0)
        self.assertEqual(count_passage_loops(maze), 0)
        self.assertEqual(count_dead_ends(maze), 2)

    def test_medium_preset_has_branches_but_no_loops(self):
        maze = self.load("medium_crossroads.txt")
        self.assertGreater(count_junctions(maze), 0)
        self.assertGreater(count_dead_ends(maze), 2)
        self.assertEqual(count_passage_loops(maze), 0)

    def test_hard_and_expert_presets_contain_loops(self):
        for name in ("hard_switchbacks.txt", "expert_archipelago.txt"):
            with self.subTest(map=name):
                self.assertGreaterEqual(count_passage_loops(self.load(name)), 1)

    def test_taught_strategies_behave_as_the_guide_claims(self):
        # Easy is solvable by the simple forward-first rule; every preset up
        # to Medium is solvable by the right-hand rule.
        self.assertTrue(
            solve_with_rule(self.load("easy_winding.txt"), FORWARD_FIRST_RULE)
        )
        for name in ("easy_winding.txt", "medium_crossroads.txt"):
            with self.subTest(map=name):
                self.assertTrue(solve_with_rule(self.load(name), RIGHT_HAND_RULE))

    def test_tutorial_maze_suits_the_tutorial(self):
        # The tutorial's final step asks the learner to solve it with the
        # right-hand rule, so that has to work on this exact maze.
        maze = self.load("default.txt")
        validate_maze(maze)
        self.assertTrue(solve_with_rule(maze, RIGHT_HAND_RULE))


class DifficultyStructureTests(unittest.TestCase):
    """Each difficulty must introduce the concept the guide claims it does."""

    SEEDS = range(20)

    def test_easy_is_one_winding_corridor(self):
        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                maze = generate_difficulty("easy", seed=seed)
                self.assertEqual(count_junctions(maze), 0)
                self.assertEqual(count_passage_loops(maze), 0)
                # Only the start and the goal are dead ends.
                self.assertEqual(count_dead_ends(maze), 2)
                self.assertGreater(len(find_solution(maze)), 20)

    def test_medium_adds_junctions_and_dead_ends_but_no_loops(self):
        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                maze = generate_difficulty("medium", seed=seed)
                self.assertGreater(count_junctions(maze), 0)
                self.assertGreater(count_dead_ends(maze), 2)
                self.assertEqual(count_passage_loops(maze), 0)

    def test_hard_and_expert_add_loops(self):
        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                self.assertGreaterEqual(
                    count_passage_loops(generate_difficulty("hard", seed=seed)), 1
                )
                self.assertGreaterEqual(
                    count_passage_loops(generate_difficulty("expert", seed=seed)), 1
                )

    def test_expert_is_more_open_than_hard(self):
        hard = sum(
            count_passage_loops(generate_difficulty("hard", seed=seed))
            for seed in self.SEEDS
        )
        expert = sum(
            count_passage_loops(generate_difficulty("expert", seed=seed))
            for seed in self.SEEDS
        )
        self.assertGreater(expert, hard)

    def test_difficulties_grow_in_size(self):
        areas = [
            int(preset["rows"]) * int(preset["columns"])
            for preset in DIFFICULTIES.values()
        ]
        self.assertEqual(areas, sorted(areas))

    def test_plaza_is_open_ground_with_separate_pillars(self):
        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                maze = generate_difficulty("plaza", seed=seed)
                # Every pillar is an island, so the floor is one open space.
                validate_maze(maze, require_all_passages_connected=True)
                # Wide open ground, not corridors: loops far outnumber a
                # braided maze's, and there are no dead ends to be trapped in.
                self.assertGreater(count_passage_loops(maze), 100)
                self.assertEqual(count_dead_ends(maze), 0)

    def test_plaza_start_and_goal_avoid_the_outer_wall(self):
        # Both against the border would let a wall follower simply walk round
        # the outside from one to the other.
        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                maze = generate_difficulty("plaza", seed=seed)
                rows, columns = len(maze), len(maze[0])
                for marker in "SG":
                    row = next(i for i, line in enumerate(maze) if marker in line)
                    column = maze[row].index(marker)
                    self.assertTrue(2 <= row <= rows - 3)
                    self.assertTrue(2 <= column <= columns - 3)

    def test_marathon_is_expert_structure_at_a_bigger_scale(self):
        expert = DIFFICULTIES["expert"]
        marathon = DIFFICULTIES["marathon"]
        self.assertEqual(marathon["style"], expert["style"])
        self.assertGreater(
            int(marathon["rows"]) * int(marathon["columns"]),
            1.8 * int(expert["rows"]) * int(expert["columns"]),
        )

        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                maze = generate_difficulty("marathon", seed=seed)
                self.assertGreaterEqual(count_passage_loops(maze), 1)
                self.assertGreater(len(find_solution(maze)), 80)


class TaughtStrategyTests(unittest.TestCase):
    """The guide promises a guarantee up to medium, and only up to medium."""

    SEEDS = range(30)

    def test_forward_first_rule_solves_every_easy_maze(self):
        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                maze = generate_difficulty("easy", seed=seed)
                self.assertTrue(solve_with_rule(maze, FORWARD_FIRST_RULE))

    def test_right_hand_rule_solves_every_easy_and_medium_maze(self):
        for level in ("easy", "medium"):
            for seed in self.SEEDS:
                with self.subTest(level=level, seed=seed):
                    maze = generate_difficulty(level, seed=seed)
                    self.assertTrue(solve_with_rule(maze, RIGHT_HAND_RULE))

    def test_harder_mazes_can_defeat_the_right_hand_rule(self):
        failures = sum(
            not solve_with_rule(generate_difficulty(level, seed=seed), RIGHT_HAND_RULE)
            for level in ("hard", "expert")
            for seed in self.SEEDS
        )
        self.assertGreater(failures, 0)

    def test_no_plaza_can_be_solved_by_following_a_wall(self):
        # A plaza has no wall worth following, so this is the one level where
        # the taught strategy is expected to fail every single time.
        for seed in self.SEEDS:
            with self.subTest(seed=seed):
                maze = generate_difficulty("plaza", seed=seed)
                self.assertFalse(solve_with_rule(maze, RIGHT_HAND_RULE))
                self.assertFalse(solve_with_rule(maze, FORWARD_FIRST_RULE))

    def test_the_challenge_seed_set_defeats_the_taught_solver(self):
        # Challenge mode runs seeds 1-25 of each level. The wall follower has
        # to fail some of them by Hard, or the challenge teaches that wall
        # following is good enough.
        challenge_seeds = range(1, 26)
        for level in ("easy", "medium"):
            for seed in challenge_seeds:
                with self.subTest(level=level, seed=seed):
                    maze = generate_difficulty(level, seed=seed)
                    self.assertTrue(solve_with_rule(maze, RIGHT_HAND_RULE))

        failed = [
            seed
            for seed in challenge_seeds
            if not solve_with_rule(
                generate_difficulty("hard", seed=seed), RIGHT_HAND_RULE
            )
        ]
        self.assertTrue(failed, "the challenge should stop the solver by Hard")


if __name__ == "__main__":
    unittest.main()
