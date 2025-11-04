from __future__ import annotations

import ast
from tkinter import Button, Canvas, Frame, Label, Scale, TclError, Text, Tk
from tkinter.filedialog import askopenfilename

CELL_SIZE = 40  # Pixel size of each maze cell
MAZE_MARGIN = 10  # Margin around the maze
MAX_ACTIONS = 2000  # Safety cap to stop runaway programs
INDENT_SPACES = 4  # Preferred indentation width for the editor and messages

ACTION_FUNCS = {"move", "turn_left", "turn_right"}
COND_FUNCS = {"at_goal", "path_ahead", "path_left", "path_right"}


class UserCodeError(Exception):
    pass


class MazeGame:

    def __init__(self):
        # GUI setup
        self.window = Tk()
        self.setup_gui()

        # Tab/Shift-Tab bindings for code editor
        self.code_txtbox.bind("<Tab>", self.indent)
        self.code_txtbox.bind("<Shift-Tab>", self.unindent)

        # Maze & robot state
        self.load_maze("mazes/default.txt")
        self.reset()
        self.load_code_sample("samples/default.txt")

    def setup_gui(self):
        # Window title
        self.window.title("Maze Game")

        # Maze panel on the left
        self.maze_canvas = Canvas(
            self.window,
            width=11 * CELL_SIZE + 2 * MAZE_MARGIN,
            height=11 * CELL_SIZE + 2 * MAZE_MARGIN,
        )
        self.maze_canvas.grid(row=0, column=0, rowspan=3, padx=10)

        # Code editor in the center
        Label(self.window, text="Program:", font=("Consolas", 15), pady=5).grid(
            row=0, column=1, sticky="w"
        )
        self.code_txtbox = Text(
            self.window, width=60, height=24, font=("Consolas", 13), undo=True
        )
        self.code_txtbox.grid(row=1, column=1, padx=(0, 10))

        # Buttons & speed slider below code editor
        btns = Frame(self.window)
        btns.grid(row=2, column=1, sticky="w", padx=(0, 10), pady=10)
        self.run_btn = Button(btns, text="▶ Run Program", command=self.run_clicked)
        self.run_btn.grid(row=0, column=0)
        self.reset_btn = Button(btns, text="⟲ Reset", command=self.reset)
        self.reset_btn.grid(row=0, column=1, padx=12)
        self.sample_btn = Button(
            btns, text="Load Sample", command=self.load_code_sample
        )
        self.sample_btn.grid(row=0, column=2)

        Label(btns, text="Speed:", font=("Consolas", 11)).grid(
            row=0, column=3, padx=(30, 5)
        )
        self.speed = Scale(btns, length=180, from_=3, to=300, orient="horizontal")
        self.speed.set(50)
        self.speed.grid(row=0, column=4)

        # Output log on the right
        Label(self.window, text="Output:", font=("Consolas", 15), pady=5).grid(
            row=0, column=2, sticky="w"
        )
        self.output = Text(self.window, width=40, height=24, state="disabled")
        self.output.grid(row=1, column=2, sticky="n", padx=(0, 10))
        self.window.grid_columnconfigure(1, weight=1)

    def indent(self, event):
        try:
            # Indent all selected lines
            start = self.code_txtbox.index("sel.first linestart")
            end = self.code_txtbox.index("sel.last lineend")
            lines = self.code_txtbox.get(start, end).split("\n")
            indented = [(" " * INDENT_SPACES) + ln if ln else ln for ln in lines]
            self.code_txtbox.delete(start, end)
            self.code_txtbox.insert(start, "\n".join(indented))
        except TclError:
            # Indent current line
            self.code_txtbox.insert("insert", " " * INDENT_SPACES)
        return "break"  # prevent default tab behavior

    def unindent(self, event):
        try:
            # Indent all selected lines
            start = self.code_txtbox.index("sel.first linestart")
            end = self.code_txtbox.index("sel.last lineend")
        except TclError:
            # Indent current line
            start = self.code_txtbox.index("insert linestart")
            end = self.code_txtbox.index("insert lineend")

        block = self.code_txtbox.get(start, end).split("\n")
        new_block = []
        for ln in block:
            cut = 0
            while cut < INDENT_SPACES and cut < len(ln) and ln[cut] == " ":
                cut += 1
            new_block.append(ln[cut:])
        self.code_txtbox.delete(start, end)
        self.code_txtbox.insert(start, "\n".join(new_block))
        return "break"  # prevent default tab behavior

    def load_maze(self, maze_file):
        # load maze file into 2d list
        with open(maze_file, "r") as f:
            lines = [line.rstrip("\n") for line in f if line.strip()]
        self.maze = [list(row) for row in lines]
        self.maze_rows = len(self.maze)
        self.maze_cols = len(self.maze[0])

        # find start and goal positions
        self.maze_start = None
        self.maze_goal = None
        for r in range(self.maze_rows):
            for c in range(self.maze_cols):
                if self.maze[r][c] == "S":
                    self.maze_start = (r, c)
                if self.maze[r][c] == "G":
                    self.maze_goal = (r, c)
        if self.maze_start is None or self.maze_goal is None:
            raise ValueError("Maze must have exactly one 'S' and one 'G'.")

    def load_code_sample(self, sample_file=None):
        # load from samples dir if no file specified
        if sample_file is None:
            sample_file = askopenfilename(
                defaultextension=".txt",
                filetypes=[("Text Files", "*.txt")],
                initialdir="samples",
            )
            if sample_file == "":
                return

        # load code sample from text file
        with open(sample_file, "r") as f:
            sample = f.read()
        self.code_txtbox.delete("1.0", "end")
        self.code_txtbox.insert("1.0", sample)

    def reset(self):
        # State attributes
        self.action_count = 0
        self.running = False
        self.dir = 1  # 0 up, 1 right, 2 down, 3 left
        self.pos = self.maze_start

        # Clear and redraw
        self.clear_output()
        self.draw_maze()
        self.draw_agent()
        self.enable_editing(True)

    def draw_maze(self):
        # Clear canvas and draw each maze cell
        self.maze_canvas.delete("all")
        for r in range(self.maze_rows):
            for c in range(self.maze_cols):
                x0 = MAZE_MARGIN + c * CELL_SIZE
                y0 = MAZE_MARGIN + r * CELL_SIZE
                x1 = x0 + CELL_SIZE
                y1 = y0 + CELL_SIZE
                if self.maze[r][c] == "#":
                    fill = "#333333"
                elif self.maze[r][c] == "S":
                    fill = "#dad7ff"
                elif self.maze[r][c] == "G":
                    fill = "#d0ffd6"
                else:
                    fill = "white"
                self.maze_canvas.create_rectangle(
                    x0, y0, x1, y1, fill=fill, outline="#eeeeee"
                )

    def draw_agent(self):
        # Draw the triangle agent at the current position and orientation
        self.maze_canvas.delete("agent")
        r, c = self.pos
        cx = MAZE_MARGIN + c * CELL_SIZE + CELL_SIZE / 2
        cy = MAZE_MARGIN + r * CELL_SIZE + CELL_SIZE / 2
        size = CELL_SIZE * 0.35
        if self.dir == 0:  # up
            pts = [
                cx,
                cy - size,
                cx - size * 0.7,
                cy + size * 0.6,
                cx + size * 0.7,
                cy + size * 0.6,
            ]
        elif self.dir == 1:  # right
            pts = [
                cx + size,
                cy,
                cx - size * 0.6,
                cy - size * 0.7,
                cx - size * 0.6,
                cy + size * 0.7,
            ]
        elif self.dir == 2:  # down
            pts = [
                cx,
                cy + size,
                cx - size * 0.7,
                cy - size * 0.6,
                cx + size * 0.7,
                cy - size * 0.6,
            ]
        elif self.dir == 3:  # left
            pts = [
                cx - size,
                cy,
                cx + size * 0.6,
                cy - size * 0.7,
                cx + size * 0.6,
                cy + size * 0.7,
            ]
        else:
            raise ValueError("Invalid direction")
        self.maze_canvas.create_polygon(
            pts, fill="#4a61ff", outline="#2b43cc", width=2, tags="agent"
        )

    def log_output(self, msg: str):
        # Append message to output log
        self.output.configure(state="normal")
        self.output.insert("end", msg + "\n")
        self.output.see("end")
        self.output.configure(state="disabled")

    def clear_output(self):
        # Clear output log
        self.output.configure(state="normal")
        self.output.delete("1.0", "end")
        self.output.configure(state="disabled")

    def enable_editing(self, flag):
        self.code_txtbox.configure(state="normal" if flag else "disabled")
        self.run_btn.configure(state="normal" if flag else "disabled")
        self.sample_btn.configure(state="normal" if flag else "disabled")

    def run_clicked(self):
        # Do nothing if already running
        if self.running:
            return

        self.clear_output()

        code = self.code_txtbox.get("1.0", "end")

        # Pre-process newlines and tabs
        code = code.replace("\r\n", "\n").replace("\r", "\n")
        code = code.expandtabs(INDENT_SPACES)

        # Try to parse the code, output syntax errors if present
        try:
            code_tree = ast.parse(code)
        except SyntaxError as e:
            self.log_output(f"Syntax error (line {e.lineno}): {e.msg}")
            return

        # Run the code
        self.reset()
        self.running = True
        self.enable_editing(False)
        code_iterator = self.exec_block(code_tree.body)
        self.step_runner(code_iterator)

    def exec_block(self, code_blocks):
        for line in code_blocks:
            lineno = getattr(line, "lineno", "?")
            if self.action_count > MAX_ACTIONS:
                self.log_output(f"Program stopped: exceeded {MAX_ACTIONS} actions.")
                self.running = False
                self.enable_editing(True)
                return

            if isinstance(line, ast.Expr) and isinstance(line.value, ast.Call):
                fname = line.value.func.id
                if fname == "move":
                    self.do_move()
                    self.action_count += 1
                    yield
                elif fname == "turn_left":
                    self.do_turn_left()
                    self.action_count += 1
                    yield
                elif fname == "turn_right":
                    self.do_turn_right()
                    self.action_count += 1
                    yield
                else:
                    raise UserCodeError(
                        f"Code error: (line {lineno}): unknown action {fname}()"
                    )
            elif isinstance(line, ast.If):
                branch = line.body if self.eval_expr(line.test, lineno) else line.orelse
                for _ in self.exec_block(branch):
                    yield
            elif isinstance(line, ast.While):
                while self.running and bool(self.eval_expr(line.test, lineno)):
                    for _ in self.exec_block(line.body):
                        yield
                    if self.action_count > MAX_ACTIONS:
                        break
                if (
                    line.orelse
                    and self.running
                    and not bool(self.eval_expr(line.test, lineno))
                ):
                    gen = self.exec_block(line.orelse)
                    for _ in gen:
                        yield
            elif isinstance(line, ast.For):
                call = line.iter
                if len(call.args) == 1:
                    start, stop = 0, call.args[0].value
                else:
                    start, stop = call.args[0].value, call.args[1].value
                for _ in range(start, stop):
                    for _ in self.exec_block(line.body):
                        yield
                    if self.action_count > MAX_ACTIONS:
                        break
            elif isinstance(line, ast.Pass):
                continue
            else:
                raise UserCodeError(
                    f"Code error: (line {lineno}): unsupported statement"
                )

    def eval_expr(self, item, lineno):
        # condition functions in if/while statements
        if isinstance(item, ast.Call) and isinstance(item.func, ast.Name):
            if item.func.id in COND_FUNCS:
                return getattr(self, item.func.id)()
            raise UserCodeError(
                f"Code error: (line {lineno}): unsupported call in expression "
                f"{item.func.id}()"
            )
        # 'not' for conditionals
        elif isinstance(item, ast.UnaryOp) and isinstance(item.op, ast.Not):
            return not bool(self.eval_expr(item.operand, lineno))
        # and/or for conditionals
        elif isinstance(item, ast.BoolOp):
            if isinstance(item.op, ast.And):
                val = True
                for v in item.values:
                    val = bool(val and self.eval_expr(v, lineno))
                    if not val:
                        break
                return val
            elif isinstance(item.op, ast.Or):
                val = False
                for v in item.values:
                    val = bool(val or self.eval_expr(v, lineno))
                    if val:
                        break
                return val
        # constants i.e. while True
        elif isinstance(item, ast.Constant):
            if isinstance(item.value, (bool, int)):
                return item.value
        elif isinstance(item, ast.Compare):
            if len(item.ops) == 1 and len(item.comparators) == 1:
                left = self.eval_expr(item.left, lineno)
                right = self.eval_expr(item.comparators[0], lineno)
                if isinstance(item.ops[0], ast.Eq):
                    return left == right
                if isinstance(item.ops[0], ast.NotEq):
                    return left != right
            else:
                raise UserCodeError(
                    f"Code error: (line {lineno}): unsupported comparison"
                )
        raise UserCodeError(f"Code error: (line {lineno}): unsupported statement")

    def step_runner(self, code_iterator):
        # Reached to the end goal
        if not self.running:
            self.enable_editing(True)
            return

        try:
            next(code_iterator)
        except StopIteration:
            self.log_output("❗ Program ended without reaching the goal.")
            self.running = False
            self.enable_editing(True)
            return
        except UserCodeError as e:
            self.log_output(str(e))
            self.running = False
            self.enable_editing(True)
            return

        # Run the next command after a delay
        self.window.after(int(self.speed.get()), self.step_runner, code_iterator)

    def in_bounds(self, r, c):
        return 0 <= r < self.maze_rows and 0 <= c < self.maze_cols

    def is_wall(self, r, c):
        if not self.in_bounds(r, c):
            return True
        return self.maze[r][c] == "#"

    def forward_delta(self, d):
        if d == 0:
            return (-1, 0)
        if d == 1:
            return (0, 1)
        if d == 2:
            return (1, 0)
        return (0, -1)

    def left_dir(self):
        return (self.dir - 1) % 4

    def right_dir(self):
        return (self.dir + 1) % 4

    def path_ahead(self):
        dr, dc = self.forward_delta(self.dir)
        r, c = self.pos[0] + dr, self.pos[1] + dc
        return not self.is_wall(r, c)

    def path_left(self):
        d = self.left_dir()
        dr, dc = self.forward_delta(d)
        r, c = self.pos[0] + dr, self.pos[1] + dc
        return not self.is_wall(r, c)

    def path_right(self):
        d = self.right_dir()
        dr, dc = self.forward_delta(d)
        r, c = self.pos[0] + dr, self.pos[1] + dc
        return not self.is_wall(r, c)

    def do_turn_left(self):
        self.dir = self.left_dir()
        self.draw_agent()

    def do_turn_right(self):
        self.dir = self.right_dir()
        self.draw_agent()

    def at_goal(self):
        return self.pos == self.maze_goal

    def do_move(self):
        if self.path_ahead():
            dr, dc = self.forward_delta(self.dir)
            self.pos = (self.pos[0] + dr, self.pos[1] + dc)
            self.draw_agent()
            if self.at_goal():
                self.log_output("🎉 Reached the goal!")
                self.running = False
            return True
        else:
            self.log_output("⛔️ Bumped into a wall.")
            return False


if __name__ == "__main__":
    game = MazeGame()
    game.window.mainloop()
