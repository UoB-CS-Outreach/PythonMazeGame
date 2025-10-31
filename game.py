"""
Pre-Program the Robot — Python Subset (Tkinter Demo)
====================================================

Visitors write *Python-like* code (a safe subset) before pressing "Run".
We parse with `ast`, validate allowed nodes, and interpret the AST ourselves
to animate the robot in a maze — no `exec`, no builtins, no imports.

Quality-of-life whitespace features
-----------------------------------
- Tab inserts 4 spaces; Shift-Tab unindents (selection-aware).
- On Run: leading tabs are converted to 4 spaces automatically.
- Friendly notes if non-standard indentation widths are detected.
- Extra help if Python reports indentation-related SyntaxErrors.

Allowed Python (subset)
-----------------------
Statements:
  - Expr(Call):   move(), turn_left(), turn_right()
  - if / elif / else
  - while <condition>:
  - pass
  - (optional) for _ in range(N) or range(a, b)   # small int literals only

Expressions in conditions:
  - at_goal(), path_ahead(), path_left(), path_right()
  - not A
  - A and B, A or B
  - parentheses
  - True / False

Not allowed: imports, defs, classes, assignments, attributes, names/variables, etc.
"""

from __future__ import annotations
import ast
import tkinter as tk

# ---------------------------- Configurable constants ----------------------------

CELL = 40            # Pixel size of each maze cell
MARGIN = 10          # Canvas margin around the grid
SPEED_MS = 150       # Default animation delay (ms) between actions
MAX_ACTIONS = 2000   # Safety cap to stop runaway programs
INDENT_SPACES = 4    # Preferred indentation width for the editor and messages
SHIFT_MASK = 0x0001  # Tk bitmask for the Shift modifier

DEFAULT_MAZE = [
    "###########",
    "#S   #    #",
    "# ## # ## #",
    "#    #    #",
    "#### ### ##",
    "#      #  #",
    "# #### #  #",
    "# #    ## #",
    "# # ##    #",
    "#   ##  G #",
    "###########",
]

# ------------------------------- Errors ----------------------------------------

class CodeError(Exception):
    """Raised when the visitor's Python subset code is invalid or unsupported."""
    pass

# --------------------------------- Main App ------------------------------------

class MazeGame:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        root.title("Pre-Program the Robot — Python Subset")

        # Layout: [Canvas] | [Editor+Buttons] | [Output]
        self.canvas = tk.Canvas(
            root,
            width=len(DEFAULT_MAZE[0]) * CELL + 2 * MARGIN,
            height=len(DEFAULT_MAZE) * CELL + 2 * MARGIN,
            bg="white",
        )
        self.canvas.grid(row=0, column=0, rowspan=3, padx=10, pady=10)

        tk.Label(root, text="Program (Python subset):").grid(row=0, column=1, sticky="w", padx=(0, 10))
        self.code = tk.Text(root, width=60, height=24, font=("Consolas", 11), undo=True, tabs=("{}c".format(INDENT_SPACES/2),))
        self.code.grid(row=1, column=1, sticky="n", padx=(0, 10))

        # Make Tab = spaces and Shift-Tab = unindent (selection-aware), cross-platform
        self.code.bind("<Tab>", self.on_tab_key)
        self.code.bind("<Shift-Tab>", self.on_tab_key)
        # On some X11 setups Shift-Tab arrives as ISO_Left_Tab; bind if supported
        try:
            self.code.bind("<ISO_Left_Tab>", self.on_tab_key)
        except tk.TclError:
            pass

        btns = tk.Frame(root)
        btns.grid(row=2, column=1, sticky="w", padx=(0, 10), pady=(8, 10))
        self.run_btn = tk.Button(btns, text="▶ Run Program", command=self.run_clicked)
        self.run_btn.grid(row=0, column=0, padx=(0, 6))
        self.reset_btn = tk.Button(btns, text="⟲ Reset", command=self.reset)
        self.reset_btn.grid(row=0, column=1, padx=6)
        self.sample_btn = tk.Button(btns, text="Load Sample", command=self.load_sample)
        self.sample_btn.grid(row=0, column=2, padx=6)

        tk.Label(btns, text="Speed:").grid(row=0, column=3, padx=(14, 4))
        self.speed = tk.Scale(btns, from_=50, to=400, orient="horizontal")
        self.speed.set(SPEED_MS)
        self.speed.grid(row=0, column=4)

        tk.Label(root, text="Output:").grid(row=0, column=2, sticky="w")
        self.output = tk.Text(root, width=40, height=24, state="disabled")
        self.output.grid(row=1, column=2, sticky="n", padx=(0, 10))
        self.root.grid_columnconfigure(1, weight=1)

        # Maze & robot state
        self.load_maze(DEFAULT_MAZE)
        self.reset()
        self.load_sample()

        # Runner state
        self.running = False
        self.action_count = 0
        self.generator = None



    # ------------------------------- UI helpers ---------------------------------

    def log(self, msg: str) -> None:
        self.output.configure(state="normal")
        self.output.insert("end", msg + "\n")
        self.output.see("end")
        self.output.configure(state="disabled")

    def clear_log(self) -> None:
        self.output.configure(state="normal")
        self.output.delete("1.0", "end")
        self.output.configure(state="disabled")

    # ------------------------ Tab/Shift-Tab behavior ----------------------------

    def on_tab_key(self, event) -> str:
        """Indent on Tab, unindent on Shift-Tab (or ISO_Left_Tab). Selection-aware."""
        # Shift is pressed if the bit is set, or keysym is the X11 'ISO_Left_Tab'
        shift = bool(event.state & SHIFT_MASK) or getattr(event, "keysym",
                                                          "") == "ISO_Left_Tab"
        if shift:
            self.unindent_selection_or_line()
        else:
            self.indent_selection_or_insert_spaces()
        return "break"

    def indent_selection_or_insert_spaces(self) -> None:
        """If a selection exists, indent each selected line; else insert spaces at cursor."""
        try:
            start = self.code.index("sel.first linestart")
            end = self.code.index("sel.last lineend")
            lines = self.code.get(start, end).split("\n")
            indented = [(" " * INDENT_SPACES) + ln if ln else ln for ln in lines]
            self.code.delete(start, end)
            self.code.insert(start, "\n".join(indented))
        except tk.TclError:
            # No selection: just insert spaces where the caret is
            self.code.insert("insert", " " * INDENT_SPACES)

    def unindent_selection_or_line(self) -> None:
        """Remove up to INDENT_SPACES leading spaces on selected lines (or current line)."""
        try:
            start = self.code.index("sel.first linestart")
            end = self.code.index("sel.last lineend")
        except tk.TclError:
            start = self.code.index("insert linestart")
            end = self.code.index("insert lineend")

        block = self.code.get(start, end).split("\n")
        new_block = []
        for ln in block:
            cut = 0
            while cut < INDENT_SPACES and cut < len(ln) and ln[cut] == " ":
                cut += 1
            new_block.append(ln[cut:])
        self.code.delete(start, end)
        self.code.insert(start, "\n".join(new_block))

    # ----------------------------- Maze management ------------------------------

    def load_maze(self, lines: list[str]) -> None:
        self.maze = [list(row) for row in lines]
        self.rows = len(self.maze)
        self.cols = len(self.maze[0])
        self.find_start_goal()
        self.draw_maze()

    def find_start_goal(self) -> None:
        self.start = None
        self.goal = None
        for r in range(self.rows):
            for c in range(self.cols):
                if self.maze[r][c] == 'S':
                    self.start = (r, c)
                if self.maze[r][c] == 'G':
                    self.goal = (r, c)
        if self.start is None or self.goal is None:
            raise ValueError("Maze must have exactly one 'S' and one 'G'.")

    def draw_maze(self) -> None:
        self.canvas.delete("all")
        for r in range(self.rows):
            for c in range(self.cols):
                x0 = MARGIN + c * CELL
                y0 = MARGIN + r * CELL
                x1 = x0 + CELL
                y1 = y0 + CELL
                cell = self.maze[r][c]
                if cell == '#':
                    fill = "#333333"
                elif cell == 'S':
                    fill = "#dad7ff"
                elif cell == 'G':
                    fill = "#d0ffd6"
                else:
                    fill = "white"
                self.canvas.create_rectangle(x0, y0, x1, y1, fill=fill, outline="#bbbbbb")
        # light grid lines
        for c in range(self.cols + 1):
            x = MARGIN + c * CELL
            self.canvas.create_line(x, MARGIN, x, MARGIN + self.rows * CELL, fill="#eeeeee")
        for r in range(self.rows + 1):
            y = MARGIN + r * CELL
            self.canvas.create_line(MARGIN, y, MARGIN + self.cols * CELL, y, fill="#eeeeee")

    def reset(self) -> None:
        self.clear_log()
        self.action_count = 0
        self.running = False
        self.dir = 1          # 0 up, 1 right, 2 down, 3 left
        self.pos = self.start
        self.draw_maze()
        self.draw_agent()
        self.enable_editing(True)

    def draw_agent(self) -> None:
        self.canvas.delete("agent")
        r, c = self.pos
        cx = MARGIN + c * CELL + CELL / 2
        cy = MARGIN + r * CELL + CELL / 2
        size = CELL * 0.35
        d = self.dir
        if d == 0:  # up
            pts = [cx, cy - size, cx - size * 0.7, cy + size * 0.6, cx + size * 0.7, cy + size * 0.6]
        elif d == 1:  # right
            pts = [cx + size, cy, cx - size * 0.6, cy - size * 0.7, cx - size * 0.6, cy + size * 0.7]
        elif d == 2:  # down
            pts = [cx, cy + size, cx - size * 0.7, cy - size * 0.6, cx + size * 0.7, cy - size * 0.6]
        else:  # left
            pts = [cx - size, cy, cx + size * 0.6, cy - size * 0.7, cx + size * 0.6, cy + size * 0.7]
        self.canvas.create_polygon(pts, fill="#4a61ff", outline="#2b43cc", width=2, tags="agent")

    # ------------------------------ World queries -------------------------------

    def in_bounds(self, r: int, c: int) -> bool:
        return 0 <= r < self.rows and 0 <= c < self.cols

    def is_wall(self, r: int, c: int) -> bool:
        if not self.in_bounds(r, c):
            return True
        return self.maze[r][c] == '#'

    def forward_delta(self, d: int | None = None) -> tuple[int, int]:
        if d is None:
            d = self.dir
        if d == 0: return (-1, 0)
        if d == 1: return (0, 1)
        if d == 2: return (1, 0)
        return (0, -1)

    def left_dir(self) -> int:
        return (self.dir - 1) % 4

    def right_dir(self) -> int:
        return (self.dir + 1) % 4

    # Conditions exposed to the Python subset
    def path_ahead(self) -> bool:
        dr, dc = self.forward_delta()
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
        return self.pos == self.goal

    # Actions exposed to the Python subset
    def do_move(self) -> bool:
        if self.path_ahead():
            dr, dc = self.forward_delta()
            self.pos = (self.pos[0] + dr, self.pos[1] + dc)
            self.draw_agent()
            if self.at_goal():
                self.log("🎉 Reached the goal!")
                self.running = False
                self.enable_editing(True)
            return True
        else:
            self.log("⛔️ Bumped into a wall.")
            return False

    def do_turn_left(self) -> None:
        self.dir = self.left_dir()
        self.draw_agent()

    def do_turn_right(self) -> None:
        self.dir = self.right_dir()
        self.draw_agent()

    # ---------------------------- Editor & runner -------------------------------

    def program_text(self) -> str:
        return self.code.get("1.0", "end")

    def enable_editing(self, flag: bool) -> None:
        state = "normal" if flag else "disabled"
        self.code.configure(state=state)
        self.run_btn.configure(state="normal" if flag else "disabled")
        self.sample_btn.configure(state="normal" if flag else "disabled")
        self.reset_btn.configure(state="normal")

    def load_sample(self) -> None:
        sample = f"""# Python-subset sample: right-hand rule solver
# Allowed: if/elif/else, while, pass, and/or/not, the functions below
# Functions you can call:
#   move(), turn_left(), turn_right()
#   path_ahead(), path_left(), path_right(), at_goal()

while not at_goal():
    if path_right():
        turn_right()
        move()
    elif path_ahead():
        move()
    else:
        turn_left()
"""
        self.code.delete("1.0", "end")
        self.code.insert("1.0", sample)

    # ---------- Whitespace pre-processing & friendly indentation notes ----------

    def preprocess_source(self, src: str) -> tuple[str, list[str]]:
        """
        Normalize newlines, convert leading tabs -> spaces, and collect gentle notes.
        Returns (normalized_src, notes).
        """
        notes: list[str] = []
        # Normalize newlines
        src = src.replace("\r\n", "\n").replace("\r", "\n")

        # Record lines that contain leading tabs (before first non-space)
        tab_lines = []
        for i, line in enumerate(src.split("\n"), start=1):
            j = 0
            while j < len(line) and line[j] in (" ", "\t"):
                if line[j] == "\t":
                    tab_lines.append(i)
                j += 1

        if tab_lines:
            notes.append(f"Converted tabs to {INDENT_SPACES} spaces on lines {self.format_line_list(tab_lines)}.")

        # Expand tabs to spaces uniformly
        expanded = src.expandtabs(INDENT_SPACES)

        # After expansion, flag lines that start with a non-multiple-of-4 indent (purely advisory)
        odd_lines = []
        for i, line in enumerate(expanded.split("\n"), start=1):
            if not line.strip():
                continue
            leading = len(line) - len(line.lstrip(" "))
            if leading > 0 and (leading % INDENT_SPACES) != 0:
                odd_lines.append(i)
        if odd_lines:
            notes.append(f"Note: indentation on lines {self.format_line_list(odd_lines)} is not a multiple of {INDENT_SPACES} spaces (Python allows it; recommending multiples of {INDENT_SPACES} for readability).")

        return expanded, notes

    @staticmethod
    def format_line_list(lines: list[int]) -> str:
        """Compact 1,2,3,5,6 -> '1–3, 5–6'."""
        if not lines:
            return ""
        lines = sorted(lines)
        ranges = []
        start = prev = lines[0]
        for n in lines[1:]:
            if n == prev + 1:
                prev = n
                continue
            ranges.append((start, prev))
            start = prev = n
        ranges.append((start, prev))
        parts = [f"{a}" if a == b else f"{a}–{b}" for a, b in ranges]
        return ", ".join(parts)

    def run_clicked(self) -> None:
        if self.running:
            return
        self.clear_log()
        raw_src = self.program_text()

        # Normalize whitespace and show any helpful notes
        src, notes = self.preprocess_source(raw_src)
        for n in notes:
            self.log(n)

        # 1) Parse to Python AST
        try:
            tree = ast.parse(src, mode="exec", type_comments=False)
        except SyntaxError as e:
            # Friendlier messaging for common indentation issues
            msg = e.msg or "syntax error"
            if "inconsistent use of tabs and spaces" in msg.lower():
                self.log("Indentation error: mixed tabs & spaces. I converted tabs to spaces; please try again or re-run.")
            elif "expected an indented block" in msg.lower():
                self.log(f"Indentation error (line {e.lineno}): expected an indented block after a header like 'if', 'elif', 'else', or 'while'.")
            elif "unindent does not match any outer indentation level" in msg.lower():
                self.log(f"Indentation error (line {e.lineno}): your dedent doesn't align with a previous block. Make sure you unindent back to the exact start of the matching block.")
            else:
                self.log(f"Syntax error (line {e.lineno}): {msg}")
            return

        # 2) Validate it's within our safe subset
        try:
            self.validate_ast(tree)
        except CodeError as e:
            self.log(f"Unsupported code: {e}")
            return

        # 3) Run with our interpreter (as a generator that yields per action)
        self.reset()  # fresh start each run
        self.running = True
        self.enable_editing(False)
        self.action_count = 0
        self.generator = self.exec_block(tree.body)
        self.root.after(10, self.step_runner)

    def step_runner(self) -> None:
        if not self.running:
            return
        try:
            next(self.generator)
        except StopIteration:
            self.running = False
            self.enable_editing(True)
            return
        if self.running:
            self.root.after(int(self.speed.get()), self.step_runner)

    # --------------------------- AST validator & VM -----------------------------

    ACTION_FUNCS = {"move", "turn_left", "turn_right"}
    COND_FUNCS = {"at_goal", "path_ahead", "path_left", "path_right"}

    def validate_ast(self, node: ast.AST) -> None:
        """
        Walk the AST and ensure only our allowed nodes/structures exist.
        We also enforce that calls are to known, argument-less functions
        (except the special range(N) in for-loops).
        """
        def err(n: ast.AST, msg: str):
            line = getattr(n, "lineno", "?")
            raise CodeError(f"line {line}: {msg}")

        def is_small_int(n: ast.AST) -> bool:
            return isinstance(n, ast.Constant) and isinstance(n.value, int) and 0 <= n.value <= 1000

        def check_expr(n: ast.AST):
            if isinstance(n, ast.Call):
                if not isinstance(n.func, ast.Name):
                    err(n, "only simple function names are allowed")
                fname = n.func.id
                if fname in self.COND_FUNCS:
                    if n.keywords or n.args:
                        err(n, f"{fname}() takes no arguments")
                    return
                if fname in self.ACTION_FUNCS:
                    if n.keywords or n.args:
                        err(n, f"{fname}() takes no arguments")
                    return
                if fname == "range":
                    if len(n.args) not in (1, 2) or n.keywords:
                        err(n, "range() must have 1 or 2 positional integer-literal args")
                    for a in n.args:
                        if not is_small_int(a):
                            err(n, "range() arguments must be small integer literals")
                    return
                err(n, f"call to unknown function '{fname}()' is not allowed")
            elif isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not):
                check_expr(n.operand)
            elif isinstance(n, ast.BoolOp) and isinstance(n.op, (ast.And, ast.Or)):
                for v in n.values:
                    check_expr(v)
            elif isinstance(n, ast.NameConstant):  # Py <3.8
                if n.value not in (True, False):
                    err(n, "only True/False constants are allowed")
            elif isinstance(n, ast.Constant):
                if isinstance(n.value, (bool, int)):
                    return
                err(n, "only booleans and small integers are allowed")
            elif isinstance(n, ast.Compare):
                if len(n.ops) != 1 or not isinstance(n.ops[0], (ast.Eq, ast.NotEq)):
                    err(n, "only == and != comparisons are allowed")
                if len(n.comparators) != 1:
                    err(n, "invalid comparison")
                check_expr(n.left)
                check_expr(n.comparators[0])
            elif hasattr(ast, "ParenExpr") and isinstance(n, ast.ParenExpr):  # Py 3.12+
                check_expr(n.expression)
            else:
                err(n, f"unsupported expression: {type(n).__name__}")

        def check_stmt(s: ast.stmt):
            if isinstance(s, ast.Expr):
                if not isinstance(s.value, ast.Call) or not isinstance(s.value.func, ast.Name):
                    err(s, "only function calls are allowed as standalone statements")
                fname = s.value.func.id
                if fname not in self.ACTION_FUNCS:
                    err(s, f"'{fname}()' cannot be used as a statement here")
                if s.value.args or s.value.keywords:
                    err(s, f"{fname}() takes no arguments")
            elif isinstance(s, ast.If):
                check_expr(s.test)
                for b in s.body: check_stmt(b)
                for b in s.orelse: check_stmt(b)
            elif isinstance(s, ast.While):
                check_expr(s.test)
                for b in s.body: check_stmt(b)
                for b in s.orelse: check_stmt(b)
            elif isinstance(s, ast.For):
                if not isinstance(s.target, ast.Name):
                    err(s, "for-loop target must be a simple name (e.g., _)")
                if not (isinstance(s.iter, ast.Call) and isinstance(s.iter.func, ast.Name) and s.iter.func.id == "range"):
                    err(s, "for-loop must iterate over range(...)")
                if s.iter.keywords or len(s.iter.args) not in (1, 2):
                    err(s, "range() must have 1 or 2 positional integer-literal args")
                for a in s.iter.args:
                    if not (isinstance(a, ast.Constant) and isinstance(a.value, int) and 0 <= a.value <= 1000):
                        err(s, "range() arguments must be small integer literals")
                for b in s.body: check_stmt(b)
                for b in s.orelse: check_stmt(b)
            elif isinstance(s, ast.Pass):
                return
            elif isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef,
                                ast.With, ast.AsyncWith, ast.Try, ast.Raise, ast.Assert,
                                ast.Import, ast.ImportFrom, ast.Assign, ast.AugAssign,
                                ast.AnnAssign, ast.Delete, ast.Global, ast.Nonlocal,
                                ast.Match)):
                err(s, f"{type(s).__name__} is not allowed")
            else:
                err(s, f"unsupported statement: {type(s).__name__}")

        if not isinstance(node, ast.Module):
            raise CodeError("top-level must be a module")
        for s in node.body:
            check_stmt(s)

    # --------------------------------- Interpreter ---------------------------------

    def eval_expr(self, n: ast.AST) -> bool | int:
        """Evaluate a whitelisted expression node."""
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
            fname = n.func.id
            if fname in self.COND_FUNCS:
                return getattr(self, fname)()
            if fname == "range":
                raise CodeError("range() is only allowed in for-loops")
            raise CodeError(f"unsupported call in expression: {fname}()")
        elif isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not):
            return not bool(self.eval_expr(n.operand))
        elif isinstance(n, ast.BoolOp):
            if isinstance(n.op, ast.And):
                val = True
                for v in n.values:
                    val = bool(val and self.eval_expr(v))
                    if not val: break
                return val
            elif isinstance(n.op, ast.Or):
                val = False
                for v in n.values:
                    val = bool(val or self.eval_expr(v))
                    if val: break
                return val
        elif isinstance(n, ast.Constant):
            if isinstance(n.value, (bool, int)):
                return n.value
        elif isinstance(n, ast.NameConstant):  # Py <3.8
            return n.value
        elif isinstance(n, ast.Compare):
            if len(n.ops) == 1 and len(n.comparators) == 1:
                left = self.eval_expr(n.left)
                right = self.eval_expr(n.comparators[0])
                if isinstance(n.ops[0], ast.Eq):
                    return left == right
                if isinstance(n.ops[0], ast.NotEq):
                    return left != right
        raise CodeError(f"unsupported expression at line {getattr(n, 'lineno', '?')}")

    def exec_block(self, stmts: list[ast.stmt]):
        """Execute a list of statements, yielding after each action for animation."""
        for s in stmts:
            if self.action_count > MAX_ACTIONS:
                self.log(f"Program stopped: exceeded {MAX_ACTIONS} actions (possible infinite loop).")
                self.running = False
                self.enable_editing(True)
                return

            if isinstance(s, ast.Expr) and isinstance(s.value, ast.Call):
                fname = s.value.func.id
                if fname == "move":
                    self.do_move(); self.action_count += 1; yield
                elif fname == "turn_left":
                    self.do_turn_left(); self.action_count += 1; yield
                elif fname == "turn_right":
                    self.do_turn_right(); self.action_count += 1; yield
                else:
                    raise CodeError(f"unknown action {fname}() at line {s.lineno}")

            elif isinstance(s, ast.If):
                branch = s.body if self.eval_expr(s.test) else s.orelse
                gen = self.exec_block(branch)
                for _ in gen: yield

            elif isinstance(s, ast.While):
                while self.running and bool(self.eval_expr(s.test)):
                    gen = self.exec_block(s.body)
                    for _ in gen: yield
                    if self.action_count > MAX_ACTIONS:
                        break
                if s.orelse and self.running and not bool(self.eval_expr(s.test)):
                    gen = self.exec_block(s.orelse)
                    for _ in gen: yield

            elif isinstance(s, ast.For):
                call = s.iter
                if len(call.args) == 1:
                    start, stop = 0, call.args[0].value
                else:
                    start, stop = call.args[0].value, call.args[1].value
                for _ in range(start, stop):
                    gen = self.exec_block(s.body)
                    for _ in gen: yield
                    if self.action_count > MAX_ACTIONS:
                        break

            elif isinstance(s, ast.Pass):
                continue

            else:
                raise CodeError(f"unsupported statement at line {getattr(s, 'lineno','?')}")

# ----------------------------------- Entrypoint --------------------------------

def main() -> None:
    root = tk.Tk()
    app = MazeGame(root)
    root.mainloop()

if __name__ == "__main__":
    main()
