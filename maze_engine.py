from __future__ import annotations

import ast
from typing import Callable, List, Optional, Sequence, Tuple

CELL_SIZE = 40
MAX_ACTIONS = 2000
INDENT_SPACES = 4

ACTION_FUNCS = {"move", "turn_left", "turn_right"}
COND_FUNCS = {"at_goal", "path_ahead", "path_left", "path_right"}


class UserCodeError(Exception):
    """Raised when the player's program contains invalid or unsafe code."""

    pass


LogFn = Callable[[str], None]
DrawMazeFn = Callable[[Sequence[Sequence[str]]], None]
DrawAgentFn = Callable[[int, int, int], None]
WinFn = Callable[[], None]


class MazeEngine:
    """
    UI-agnostic maze + interpreter engine for running in the browser (Pyodide) or

    desktop.

    Responsibilities:
    - Parse a maze from text.
    - Track agent position & direction.
    - Provide helper predicates (path_ahead, at_goal, ...).
    - Execute restricted Python-like code via the AST.
    - Yield after each action so the caller can animate step-by-step.
    """

    def __init__(
        self,
        maze_str: str,
        log_fn: Optional[LogFn] = None,
        draw_maze_fn: Optional[DrawMazeFn] = None,
        draw_agent_fn: Optional[DrawAgentFn] = None,
        win_fn: Optional[WinFn] = None,
    ) -> None:
        self.log_fn = log_fn or (lambda msg: None)
        self.draw_maze_fn = draw_maze_fn or (lambda maze: None)
        self.draw_agent_fn = draw_agent_fn or (lambda r, c, d: None)
        self.win_fn = win_fn or (lambda: None)

        self.maze: List[List[str]] = []
        self.maze_rows = 0
        self.maze_cols = 0
        self.maze_start: Tuple[int, int] = (0, 0)
        self.maze_goal: Tuple[int, int] = (0, 0)

        self.action_count = 0
        self.running = False
        self.dir = 1  # 0=up,1=right,2=down,3=left
        self.pos: Tuple[int, int] = (0, 0)

        self.load_maze_from_string(maze_str)
        self.reset()

    # ------------------------------------------------------------------ #
    # Maze setup & drawing
    # ------------------------------------------------------------------ #

    def load_maze_from_string(self, maze_str: str) -> None:
        lines = [
            line.rstrip("\n") for line in maze_str.splitlines() if line.strip() != ""
        ]
        if not lines:
            raise ValueError("Maze is empty.")

        width = len(lines[0])
        for row in lines:
            if len(row) != width:
                raise ValueError("All maze rows must be the same width.")

        self.maze = [list(row) for row in lines]
        self.maze_rows = len(self.maze)
        self.maze_cols = len(self.maze[0])

        start = None
        goal = None
        for r in range(self.maze_rows):
            for c in range(self.maze_cols):
                if self.maze[r][c] == "S":
                    if start is not None:
                        raise ValueError("Maze must contain exactly one 'S'.")
                    start = (r, c)
                elif self.maze[r][c] == "G":
                    if goal is not None:
                        raise ValueError("Maze must contain exactly one 'G'.")
                    goal = (r, c)

        if start is None or goal is None:
            raise ValueError("Maze must contain one 'S' (start) and one 'G' (goal).")

        self.maze_start = start
        self.maze_goal = goal

    def reset(self) -> None:
        self.action_count = 0
        self.running = True
        self.dir = 1  # facing right
        self.pos = self.maze_start
        self.draw_maze_fn(self.maze)
        self.draw_agent_fn(self.pos[0], self.pos[1], self.dir)

    # ------------------------------------------------------------------ #
    # Maze helpers
    # ------------------------------------------------------------------ #

    def log(self, msg: str) -> None:
        self.log_fn(str(msg))

    def in_bounds(self, r: int, c: int) -> bool:
        return 0 <= r < self.maze_rows and 0 <= c < self.maze_cols

    def is_wall(self, r: int, c: int) -> bool:
        if not self.in_bounds(r, c):
            return True
        return self.maze[r][c] == "#"

    @staticmethod
    def forward_delta(direction: int) -> Tuple[int, int]:
        if direction == 0:  # up
            return -1, 0
        if direction == 1:  # right
            return 0, 1
        if direction == 2:  # down
            return 1, 0
        return 0, -1  # left

    def left_dir(self) -> int:
        return (self.dir - 1) % 4

    def right_dir(self) -> int:
        return (self.dir + 1) % 4

    # Predicates exposed to user code ------------------------------ #

    def path_ahead(self) -> bool:
        dr, dc = self.forward_delta(self.dir)
        r, c = self.pos[0] + dr, self.pos[1] + dc
        return not self.is_wall(r, c)

    def path_left(self) -> bool:
        d = self.left_dir()
        dr, dc = self.forward_delta(d)
        r, c = self.pos[0] + dr, self.pos[1] + dc
        return not self.is_wall(r, c)

    def path_right(self) -> bool:
        d = self.right_dir()
        dr, dc = self.forward_delta(d)
        r, c = self.pos[0] + dr, self.pos[1] + dc
        return not self.is_wall(r, c)

    def at_goal(self) -> bool:
        return self.pos == self.maze_goal

    # Actions exposed to user code -------------------------------- #

    def do_turn_left(self) -> None:
        self.dir = self.left_dir()
        self.draw_agent_fn(self.pos[0], self.pos[1], self.dir)

    def do_turn_right(self) -> None:
        self.dir = self.right_dir()
        self.draw_agent_fn(self.pos[0], self.pos[1], self.dir)

    def do_move(self) -> bool:
        if self.path_ahead():
            dr, dc = self.forward_delta(self.dir)
            self.pos = (self.pos[0] + dr, self.pos[1] + dc)
            self.draw_agent_fn(self.pos[0], self.pos[1], self.dir)
            if self.at_goal():
                self.log("🎉 Reached the goal!")
                self.running = False
                self.win_fn()
            return True
        else:
            self.log("⛔️ Bumped into a wall.")
            return False

    # ------------------------------------------------------------------ #
    # Restricted code execution
    # ------------------------------------------------------------------ #

    def compile_user_code(self, code_str: str):
        """
        Parse and validate the player's program, then return a step generator.

        Usage:
            code_iter = engine.compile_user_code(source)
            # then repeatedly: next(code_iter)
        """
        code = code_str.replace("\r\n", "\n").replace("\r", "\n")
        code = code.expandtabs(INDENT_SPACES)

        try:
            tree = ast.parse(code, mode="exec")
        except SyntaxError as e:
            raise UserCodeError(f"Syntax error on line {e.lineno}: {e.msg}")

        self._validate_tree(tree)

        # Reset each run; UI calls this via compile_user_code.
        self.reset()
        return self.exec_block(tree.body)

    # -- Validation ------------------------------------------------ #

    def _validate_tree(self, tree: ast.AST) -> None:
        for node in ast.walk(tree):
            if isinstance(
                node,
                (
                    ast.Import,
                    ast.ImportFrom,
                    ast.With,
                    ast.Try,
                    ast.Raise,
                    ast.Lambda,
                    ast.ClassDef,
                    ast.FunctionDef,
                    ast.AsyncFunctionDef,
                    ast.Await,
                    ast.ListComp,
                    ast.DictComp,
                    ast.SetComp,
                    ast.GeneratorExp,
                    ast.Delete,
                ),
            ):
                lineno = getattr(node, "lineno", "?")
                raise UserCodeError(
                    f"Code error (line {lineno}): unsupported syntax "
                    f"'{type(node).__name__}'."
                )

            if isinstance(node, ast.Attribute):
                lineno = getattr(node, "lineno", "?")
                raise UserCodeError(
                    f"Code error (line {lineno}): attribute access is not allowed."
                )

            if isinstance(node, ast.Subscript):
                lineno = getattr(node, "lineno", "?")
                raise UserCodeError(
                    f"Code error (line {lineno}): indexing and slicing are not allowed."
                )

            if isinstance(node, ast.Call):
                if not isinstance(node.func, ast.Name):
                    lineno = getattr(node, "lineno", "?")
                    raise UserCodeError(
                        f"Code error (line {lineno}): invalid function call."
                    )
                fname = node.func.id
                if fname not in ACTION_FUNCS | COND_FUNCS | {"range"}:
                    lineno = getattr(node, "lineno", "?")
                    raise UserCodeError(
                        f"Code error (line {lineno}): unknown function '{fname}'."
                    )

    # -- Expression evaluator for conditions ----------------------- #

    def eval_expr(self, node: ast.AST, lineno: int):
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise UserCodeError(
                    f"Code error (line {lineno}): invalid function call."
                )
            fname = node.func.id
            if fname not in COND_FUNCS:
                raise UserCodeError(
                    f"Code error (line {lineno}): '{fname}' cannot be used here."
                )
            if node.args or node.keywords:
                raise UserCodeError(
                    f"Code error (line {lineno}): '{fname}()' does not take arguments."
                )
            return getattr(self, fname)()

        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            return not bool(self.eval_expr(node.operand, lineno))

        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                result = True
                for v in node.values:
                    result = bool(self.eval_expr(v, lineno))
                    if not result:
                        break
                return result
            if isinstance(node.op, ast.Or):
                result = False
                for v in node.values:
                    result = bool(self.eval_expr(v, lineno))
                    if result:
                        break
                return result
            raise UserCodeError(
                f"Code error (line {lineno}): unsupported boolean operator."
            )

        if isinstance(node, ast.Constant) and isinstance(node.value, bool):
            return node.value

        if isinstance(node, ast.Name) and node.id in ("True", "False"):
            return node.id == "True"

        if isinstance(node, ast.Compare):
            if len(node.ops) != 1 or len(node.comparators) != 1:
                raise UserCodeError(
                    f"Code error (line {lineno}): chained comparisons are not allowed."
                )
            left = self.eval_expr(node.left, lineno)
            right = self.eval_expr(node.comparators[0], lineno)
            op = node.ops[0]
            if isinstance(op, ast.Eq):
                return left == right
            if isinstance(op, ast.NotEq):
                return left != right
            raise UserCodeError(
                f"Code error (line {lineno}): only == and != comparisons are allowed."
            )

        raise UserCodeError(
            f"Code error (line {lineno}): invalid expression in condition."
        )

    # ------------------------------------------------------------------ #
    # Statement executor
    # ------------------------------------------------------------------ #

    def exec_block(self, code_blocks: Sequence[ast.stmt]):
        """
        Execute a sequence of statements as a generator, yielding
        control after each action so the caller can animate.
        """
        for line in code_blocks:
            if not self.running:
                return

            lineno = getattr(line, "lineno", "?")

            if self.action_count > MAX_ACTIONS:
                self.log(f"Program stopped: exceeded {MAX_ACTIONS} actions.")
                self.running = False
                return

            if isinstance(line, ast.Expr) and isinstance(line.value, ast.Call):
                # Standalone actions like move(), turn_left(), turn_right()
                call = line.value
                yield from self._exec_action_call(call, lineno)
                continue

            if isinstance(line, ast.While):
                while self.running and bool(self.eval_expr(line.test, lineno)):
                    for _ in self.exec_block(line.body):
                        yield
                    if self.action_count > MAX_ACTIONS:
                        break
                if line.orelse and self.running:
                    for _ in self.exec_block(line.orelse):
                        yield
                continue

            if isinstance(line, ast.If):
                if self.running and bool(self.eval_expr(line.test, lineno)):
                    for _ in self.exec_block(line.body):
                        yield
                else:
                    handled = False
                    for idx, o in enumerate(line.orelse):
                        if isinstance(o, ast.If):  # elif
                            o_lno = getattr(o, "lineno", lineno)
                            if self.running and bool(self.eval_expr(o.test, o_lno)):
                                for _ in self.exec_block(o.body):
                                    yield
                                handled = True
                                break
                        else:
                            if self.running:
                                for _ in self.exec_block(line.orelse[idx:]):
                                    yield
                            handled = True
                            break
                    if not handled:
                        pass
                continue

            if isinstance(line, ast.For):
                for _ in self._exec_for(line, lineno):
                    yield
                continue

            if isinstance(line, ast.Pass):
                continue

            raise UserCodeError(f"Code error (line {lineno}): unsupported statement.")

    # -- Helpers for actions & loops -------------------------------- #

    def _exec_action_call(self, call: ast.Call, lineno: int):
        if not isinstance(call.func, ast.Name):
            raise UserCodeError(f"Code error (line {lineno}): invalid function call.")
        fname = call.func.id
        if fname not in ACTION_FUNCS:
            raise UserCodeError(
                f"Code error (line {lineno}): only "
                f"{', '.join(sorted(ACTION_FUNCS))} can be used as actions."
            )
        if call.args or call.keywords:
            raise UserCodeError(
                f"Code error (line {lineno}): '{fname}()' does not take arguments."
            )

        if fname == "move":
            self.action_count += 1
            self.do_move()
        elif fname == "turn_left":
            self.action_count += 1
            self.do_turn_left()
        elif fname == "turn_right":
            self.action_count += 1
            self.do_turn_right()

        yield  # one animation step

    def _parse_range_bound(self, expr: ast.AST, lineno: int) -> int:
        if isinstance(expr, ast.Constant) and isinstance(expr.value, int):
            return expr.value
        if (
            isinstance(expr, ast.UnaryOp)
            and isinstance(expr.op, ast.USub)
            and isinstance(expr.operand, ast.Constant)
            and isinstance(expr.operand.value, int)
        ):
            return -expr.operand.value
        raise UserCodeError(
            f"Code error (line {lineno}): range() bounds must be integer literals."
        )

    def _exec_for(self, node: ast.For, lineno: int):
        it = node.iter
        if not (
            isinstance(it, ast.Call)
            and isinstance(it.func, ast.Name)
            and it.func.id == "range"
        ):
            raise UserCodeError(
                f"Code error (line {lineno}): for-loops must use range()."
            )

        if len(it.args) == 1:
            start = 0
            stop = self._parse_range_bound(it.args[0], lineno)
        elif len(it.args) == 2:
            start = self._parse_range_bound(it.args[0], lineno)
            stop = self._parse_range_bound(it.args[1], lineno)
        else:
            raise UserCodeError(
                f"Code error (line {lineno}): range() must have 1 or 2 arguments."
            )

        for _ in range(start, stop):
            if not self.running or self.action_count > MAX_ACTIONS:
                break
            for _ in self.exec_block(node.body):
                yield
            if self.action_count > MAX_ACTIONS:
                break
