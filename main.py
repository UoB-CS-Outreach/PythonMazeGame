import ast
import asyncio
import math
import sys

import pygame

IS_WEB = sys.platform == "emscripten"

# ----- layout -----
GRID_W, GRID_H = 14, 10
TILE = 48
LEFT_W = 460
WIN_W = LEFT_W + GRID_W * TILE + 28
WIN_H = GRID_H * TILE + 28
FPS = 60

# ----- colors -----
BG = (26, 28, 35)
PANEL = (34, 37, 46)
BORDER = (60, 64, 75)
TEXT = (232, 235, 243)
MUTED = (170, 173, 184)
ACCENT = (255, 208, 80)
AGENT = (90, 170, 255)
OK = (44, 187, 93)
ERR = (235, 84, 84)
BTN = (45, 50, 62)
BTN_PRI = (52, 120, 246)
WALL = (30, 33, 42)
FLOOR = (243, 244, 248)

# ----- mazes -----
MAZES = [
    [
        "##############",
        "#S....#......#",
        "###.#.#.####.#",
        "#...#.#....#.#",
        "#.###.####.#.#",
        "#...#......#.#",
        "#.#.########.#",
        "#.#........#.#",
        "#.######.#.#G#",
        "##############",
    ],
    [
        "##############",
        "#S.....#.....#",
        "#.###..#.###.#",
        "#...#..#...#.#",
        "###.#..###.#.#",
        "#...#......#.#",
        "#.#.########.#",
        "#.#........#.#",
        "#.######.#.#G#",
        "##############",
    ],
]

# ----- samples -----
SAMPLES = [
    """# Right-hand rule
while not at_goal():
    if path_right():
        turn_right()
        move()
    elif path_ahead():
        move()
    else:
        turn_left()
""",
    """# Left-hand rule
while not at_goal():
    if path_left():
        turn_left()
        move()
    elif path_ahead():
        move()
    else:
        turn_right()
""",
]


# ----- helpers -----
def clamp(v, a, b):
    return a if v < a else b if v > b else v


DIRS = [(0, -1), (1, 0), (0, 1), (-1, 0)]


def pick_font(cands, size):
    avail = set(pygame.font.get_fonts())
    for n in cands:
        if n and n.lower() in avail:
            return pygame.font.SysFont(n, size)
    return pygame.font.Font(None, size)


# ----- core model -----
class Maze:
    def __init__(self, grid):
        self.grid = [list(r) for r in grid]
        self.h = len(self.grid)
        self.w = len(self.grid[0]) if self.h else 0
        self.start = self._find("S") or (1, 1)
        self.goal = self._find("G") or (self.w - 2, self.h - 2)

    def _find(self, ch):
        for y, row in enumerate(self.grid):
            for x, c in enumerate(row):
                if c == ch:
                    return (x, y)

    def in_bounds(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def cell(self, x, y):
        return self.grid[y][x] if self.in_bounds(x, y) else "#"


class Agent:
    def __init__(self, maze):
        self.maze = maze
        self.reset()

    def reset(self):
        self.x, self.y = self.maze.start
        self.dir = 1
        self.actions = 0  # face right

    def at_goal(self):
        return (self.x, self.y) == self.maze.goal

    def _peek(self, d):
        dx, dy = DIRS[d % 4]
        return self.x + dx, self.y + dy

    def path_ahead(self):
        nx, ny = self._peek(self.dir)
        return self.maze.cell(nx, ny) != "#"

    def path_left(self):
        nx, ny = self._peek(self.dir - 1)
        return self.maze.cell(nx, ny) != "#"

    def path_right(self):
        nx, ny = self._peek(self.dir + 1)
        return self.maze.cell(nx, ny) != "#"

    def turn_left(self):
        self.dir = (self.dir - 1) % 4
        self.actions += 1
        return True

    def turn_right(self):
        self.dir = (self.dir + 1) % 4
        self.actions += 1
        return True

    def move(self):
        if self.path_ahead():
            self.x, self.y = self._peek(self.dir)
        self.actions += 1
        return True


# ----- safe subset interpreter -----
class SafeInterpreter:
    ACTIONS = {"move", "turn_left", "turn_right"}
    PREDS = {"at_goal", "path_ahead", "path_left", "path_right"}

    def __init__(self, api):
        self.api = api
        self.locals = {}

    def _ok(self, node):
        ok = (
            ast.Module,
            ast.Expr,
            ast.Call,
            ast.If,
            ast.While,
            ast.Assign,
            ast.AugAssign,
            ast.Load,
            ast.Store,
            ast.Name,
            ast.Constant,
            ast.Num,
            ast.UnaryOp,
            ast.UAdd,
            ast.USub,
            ast.Not,
            ast.BinOp,
            ast.Add,
            ast.Sub,
            ast.Mult,
            ast.Div,
            ast.FloorDiv,
            ast.Mod,
            ast.BoolOp,
            ast.And,
            ast.Or,
            ast.Compare,
            ast.Lt,
            ast.LtE,
            ast.Gt,
            ast.GtE,
            ast.Eq,
            ast.NotEq,
        )
        if not isinstance(node, ok):
            raise ValueError(f"Unsupported: {type(node).__name__}")
        for c in ast.iter_child_nodes(node):
            self._ok(c)

    def _eval(self, n):
        if isinstance(n, ast.Constant):
            if isinstance(n.value, (bool, int)):
                return n.value
            raise ValueError("Only ints/bools allowed.")
        if isinstance(n, ast.Num):
            return n.n
        if isinstance(n, ast.Name):
            if n.id in self.locals:
                return self.locals[n.id]
            raise ValueError(f"Unknown name '{n.id}'")
        if isinstance(n, ast.UnaryOp):
            if isinstance(n.op, ast.Not):
                return not self._eval(n.operand)
            elif isinstance(n.op, ast.UAdd):
                return +int(self._eval(n.operand))
            elif isinstance(n.op, ast.USub):
                return -int(self._eval(n.operand))
        if isinstance(n, ast.BoolOp):
            if isinstance(n.op, ast.And):
                r = True
                for v in n.values:
                    r = r and bool(self._eval(v))
                    if not r:
                        break
                return r
            if isinstance(n.op, ast.Or):
                r = False
                for v in n.values:
                    r = r or bool(self._eval(v))
                    if r:
                        break
                return r
        if isinstance(n, ast.BinOp):
            a, b = int(self._eval(n.left)), int(self._eval(n.right))
            if isinstance(n.op, ast.Add):
                return a + b
            elif isinstance(n.op, ast.Sub):
                return a - b
            elif isinstance(n.op, ast.Mult):
                return a * b
            elif isinstance(n.op, (ast.Div, ast.FloorDiv)):
                return a // b
            elif isinstance(n.op, ast.Mod):
                return a % b
        if isinstance(n, ast.Compare):
            left = self._eval(n.left)
            ok = True
            for op, comp in zip(n.ops, n.comparators):
                right = self._eval(comp)
                if isinstance(op, ast.Lt):
                    ok &= left < right
                elif isinstance(op, ast.LtE):
                    ok &= left <= right
                elif isinstance(op, ast.Gt):
                    ok &= left > right
                elif isinstance(op, ast.GtE):
                    ok &= left >= right
                elif isinstance(op, ast.Eq):
                    ok &= left == right
                elif isinstance(op, ast.NotEq):
                    ok &= left != right
                else:
                    raise ValueError("Bad comparator")
                left = right
            return ok
        if isinstance(n, ast.Call):
            if not isinstance(n.func, ast.Name):
                raise ValueError("Only simple calls")
            name = n.func.id
            if name in self.PREDS:
                if n.args or n.keywords:
                    raise ValueError("No-arg predicates only")
                return bool(self.api[name]())
            raise ValueError(f"Call not allowed here: {name}")
        raise ValueError(f"Unsupported expr: {type(n).__name__}")

    def _exec(self, node):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            name = node.value.func.id if isinstance(node.value.func, ast.Name) else None
            if name in self.ACTIONS:
                if node.value.args or node.value.keywords:
                    raise ValueError(f"{name}() takes no args")
                self.api[name]()
                yield name
                return
            if name in self.PREDS:
                _ = self.api[name]()
                return
            raise ValueError(f"Unknown function '{name}'")
        if isinstance(node, ast.If):
            body = node.body if bool(self._eval(node.test)) else node.orelse
            for s in body:
                yield from self._exec(s)
            return
        if isinstance(node, ast.While):
            guard = 0
            while bool(self._eval(node.test)):
                guard += 1
                if guard > 20000:
                    raise ValueError("Loop guard exceeded.")
                for s in node.body:
                    yield from self._exec(s)
            for s in node.orelse:
                yield from self._exec(s)
            return
        if isinstance(node, ast.Assign):
            if len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
                raise ValueError("Use simple 'name = expr'")
            self.locals[node.targets[0].id] = int(self._eval(node.value))
            return
        if isinstance(node, ast.AugAssign):
            if not isinstance(node.target, ast.Name):
                raise ValueError("Use simple 'name op= expr'")
            cur = int(self.locals.get(node.target.id, 0))
            delta = int(self._eval(node.value))
            if isinstance(node.op, ast.Add):
                self.locals[node.target.id] = cur + delta
            elif isinstance(node.op, ast.Sub):
                self.locals[node.target.id] = cur - delta
            else:
                raise ValueError("Only += and -= supported")
            return
        raise ValueError(f"Unsupported statement: {type(node).__name__}")

    def program(self, src):
        tree = ast.parse(src, mode="exec")
        self._ok(tree)
        for stmt in tree.body:
            yield from self._exec(stmt)


# ----- editor -----
class Editor:
    def __init__(self, rect, font):
        self.rect = pygame.Rect(rect)
        self.font = font
        self.lines = [""]
        self.row = self.col = 0
        self.scroll = 0
        self.blink = 0
        self.focus = True

    def set_text(self, s):
        self.lines = s.splitlines() or [""]
        self.row = self.col = self.scroll = 0

    def get_text(self):
        return "\n".join(self.lines)

    def handle(self, e):
        if e.type != pygame.KEYDOWN or not self.focus:
            return
        if e.key == pygame.K_BACKSPACE:
            if self.col > 0:
                L = self.lines[self.row]
                self.lines[self.row] = L[: self.col - 1] + L[self.col :]
                self.col -= 1
            elif self.row > 0:
                prev = self.lines[self.row - 1]
                self.col = len(prev)
                self.lines[self.row - 1] = prev + self.lines[self.row]
                del self.lines[self.row]
                self.row -= 1
        elif e.key == pygame.K_RETURN:
            L = self.lines[self.row]
            left, right = L[: self.col], L[self.col :]
            self.lines[self.row] = left
            self.lines.insert(self.row + 1, right)
            self.row += 1
            self.col = 0
        elif e.key == pygame.K_TAB:
            self._ins("    ")
        elif e.key in (
            pygame.K_LEFT,
            pygame.K_RIGHT,
            pygame.K_UP,
            pygame.K_DOWN,
            pygame.K_HOME,
            pygame.K_END,
            pygame.K_PAGEUP,
            pygame.K_PAGEDOWN,
        ):
            self._nav(e.key)
        else:
            if e.unicode and e.unicode >= " ":
                self._ins(e.unicode)

    def _ins(self, s):
        L = self.lines[self.row]
        self.lines[self.row] = L[: self.col] + s + L[self.col :]
        self.col += len(s)

    def _nav(self, k):
        if k == pygame.K_LEFT:
            if self.col > 0:
                self.col -= 1
            elif self.row > 0:
                self.row -= 1
                self.col = len(self.lines[self.row])
        elif k == pygame.K_RIGHT:
            if self.col < len(self.lines[self.row]):
                self.col += 1
            elif self.row < len(self.lines) - 1:
                self.row += 1
                self.col = 0
        elif k == pygame.K_UP:
            self.row = max(0, self.row - 1)
            self.col = min(self.col, len(self.lines[self.row]))
        elif k == pygame.K_DOWN:
            self.row = min(len(self.lines) - 1, self.row + 1)
            self.col = min(self.col, len(self.lines[self.row]))
        elif k == pygame.K_HOME:
            self.col = 0
        elif k == pygame.K_END:
            self.col = len(self.lines[self.row])
        elif k == pygame.K_PAGEUP:
            self.scroll = max(0, self.scroll - 10)
        elif k == pygame.K_PAGEDOWN:
            self.scroll += 10

    def draw(self, surf):
        pygame.draw.rect(surf, PANEL, self.rect, border_radius=8)
        pygame.draw.rect(surf, BORDER, self.rect, 1, border_radius=8)
        inner = self.rect.inflate(-14, -14)
        lh = self.font.get_linesize()
        lnw = 34
        code_x = inner.x + lnw + 6
        max_vis = max(1, inner.h // lh)
        self.scroll = clamp(self.scroll, 0, max(0, len(self.lines) - max_vis))
        if self.row < self.scroll:
            self.scroll = self.row
        if self.row >= self.scroll + max_vis:
            self.scroll = self.row - max_vis + 1
        # clip to editor area (prevents any overflow)
        prev_clip = surf.get_clip()
        surf.set_clip(inner)
        for i in range(max_vis):
            li = self.scroll + i
            if li >= len(self.lines):
                break
            surf.blit(
                self.font.render(str(li + 1).rjust(3), True, MUTED),
                (inner.x, inner.y + i * lh),
            )
            surf.blit(
                self.font.render(self.lines[li], True, TEXT), (code_x, inner.y + i * lh)
            )
        self.blink = (self.blink + 1) % FPS
        if self.focus and self.blink < FPS // 2:
            cx = code_x + self.font.size(self.lines[self.row][: self.col])[0]
            cy = inner.y + (self.row - self.scroll) * lh
            pygame.draw.line(surf, ACCENT, (cx, cy), (cx, cy + lh - 2), 2)
        surf.set_clip(prev_clip)


# ----- logger (no overflow; clipped) -----
class Logger:
    def __init__(self, rect, font):
        self.rect = pygame.Rect(rect)
        self.font = font
        self.lines = []
        self.history_cap = 300

    def log(self, msg):
        self.lines.append(str(msg))
        if len(self.lines) > self.history_cap:
            self.lines = self.lines[-self.history_cap :]

    def draw(self, surf):
        pygame.draw.rect(surf, PANEL, self.rect, border_radius=8)
        pygame.draw.rect(surf, BORDER, self.rect, 1, border_radius=8)
        inner = self.rect.inflate(-12, -12)
        lh = self.font.get_linesize()
        max_vis = max(1, inner.h // lh)
        # only draw the lines that can be seen
        view = self.lines[-max_vis:]
        prev_clip = surf.get_clip()
        surf.set_clip(inner)  # hard clip so nothing leaks outside
        y = inner.y
        for line in view:
            surf.blit(self.font.render(line, True, MUTED), (inner.x, y))
            y += lh
        surf.set_clip(prev_clip)


# ----- buttons -----
class Button:
    def __init__(self, rect, label, primary=False):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.primary = primary

    def draw(self, surf, font):
        pygame.draw.rect(
            surf, BTN_PRI if self.primary else BTN, self.rect, border_radius=6
        )
        pygame.draw.rect(surf, BORDER, self.rect, 1, border_radius=6)
        # keep text fully inside even with odd DPI: ellipsize if needed
        pad = 10
        label = self.label
        while font.size(label)[0] > self.rect.w - pad and len(label) > 1:
            label = label[:-2] + "…"
        text = font.render(label, True, TEXT)
        surf.blit(text, text.get_rect(center=self.rect.center))

    def hit(self, pos):
        return self.rect.collidepoint(pos)


# ----- drawing -----
def draw_maze(surf, maze, agent, area):
    x0, y0, w, h = area
    pygame.draw.rect(surf, PANEL, area, border_radius=8)
    pygame.draw.rect(surf, BORDER, area, 1, border_radius=8)
    offx = x0 + (w - GRID_W * TILE) // 2
    offy = y0 + (h - GRID_H * TILE) // 2
    for y in range(maze.h):
        for x in range(maze.w):
            r = pygame.Rect(offx + x * TILE, offy + y * TILE, TILE - 1, TILE - 1)
            ch = maze.cell(x, y)
            pygame.draw.rect(surf, WALL if ch == "#" else FLOOR, r)
            if (x, y) == maze.goal:
                pygame.draw.rect(
                    surf, ACCENT, r.inflate(-TILE * 0.2, -TILE * 0.2), border_radius=6
                )
    ax = offx + agent.x * TILE + TILE / 2
    ay = offy + agent.y * TILE + TILE / 2
    ang = [270, 0, 90, 180][agent.dir]
    pts = [
        (
            ax + math.cos(math.radians(ang + a)) * TILE * 0.38,
            ay + math.sin(math.radians(ang + a)) * TILE * 0.38,
        )
        for a in (0, 140, -140)
    ]
    pygame.draw.polygon(surf, OK if agent.at_goal() else AGENT, pts)


# ----- app -----
class App:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Maze (Pygame minimal)")
        self.screen = pygame.display.set_mode((WIN_W, WIN_H))
        self.clock = pygame.time.Clock()
        self.font = pick_font(
            [
                "consolas",
                "menlo",
                "dejavusansmono",
                "couriernew",
                "liberationmono",
                "monospace",
            ],
            18,
        )
        self.small = pick_font(
            [
                "consolas",
                "menlo",
                "dejavusansmono",
                "couriernew",
                "liberationmono",
                "monospace",
            ],
            16,
        )

        # controls
        y = 14
        self.btn_run = Button((14, y, 110, 34), "Run", primary=True)
        self.btn_step = Button((132, y, 110, 34), "Step")
        self.btn_reset = Button((250, y, 110, 34), "Reset")
        y += 44
        self.btn_maze = Button((14, y, 110, 30), "Maze")
        self.btn_sample = Button((132, y, 110, 30), "Sample")
        self.btn_spd_m = Button((250, y, 52, 28), "-")
        self.btn_spd_p = Button((316, y, 52, 28), "+")
        self.speed = 6  # actions/s

        # editor + logger layout (fills remaining space without spill)
        top_gap = 12
        left_margin = 14
        between = 12
        bottom_margin = 14

        editor_y = y + 30 + top_gap
        editor_h = int((WIN_H - editor_y - bottom_margin - between) * 0.55)
        self.editor = Editor(
            (left_margin, editor_y, LEFT_W - 2 * left_margin, editor_h), self.small
        )

        log_y = editor_y + editor_h + between
        log_h = WIN_H - log_y - bottom_margin
        self.log = Logger(
            (left_margin, log_y, LEFT_W - 2 * left_margin, log_h), self.small
        )

        # model
        self.maze_idx = 0
        self.maze = Maze(MAZES[self.maze_idx])
        self.agent = Agent(self.maze)
        self.sample_idx = 0
        self.editor.set_text(SAMPLES[self.sample_idx])

        # exec
        self.gen = None
        self.running = False
        self.max_actions = 2000
        self.log.log("Ready.")

    def _api(self):
        return {
            "move": self.agent.move,
            "turn_left": self.agent.turn_left,
            "turn_right": self.agent.turn_right,
            "at_goal": self.agent.at_goal,
            "path_ahead": self.agent.path_ahead,
            "path_left": self.agent.path_left,
            "path_right": self.agent.path_right,
        }

    def start(self):
        self.agent.reset()
        try:
            self.gen = SafeInterpreter(self._api()).program(self.editor.get_text())
            self.running = True
            self.log.log("Started.")
        except Exception as e:
            self.gen = None
            self.running = False
            self.log.log(f"Error: {e}")

    def stop(self, msg):
        self.running = False
        self.gen = None
        self.log.log(msg)

    def step_once(self):
        if self.gen is None:
            try:
                self.gen = SafeInterpreter(self._api()).program(self.editor.get_text())
            except Exception as e:
                self.log.log(f"Error: {e}")
                return
        try:
            _ = next(self.gen)
            if self.agent.actions > self.max_actions:
                self.stop("Max actions exceeded.")
        except StopIteration:
            self.stop("Reached goal!" if self.agent.at_goal() else "Finished.")
        except Exception as e:
            self.stop(f"Error: {e}")

    def change_maze(self, delta):
        self.maze_idx = (self.maze_idx + delta) % len(MAZES)
        self.maze = Maze(MAZES[self.maze_idx])
        self.agent = Agent(self.maze)
        self.stop(f"Maze {self.maze_idx+1} loaded.")

    def change_sample(self, delta):
        self.sample_idx = (self.sample_idx + delta) % len(SAMPLES)
        self.editor.set_text(SAMPLES[self.sample_idx])
        self.stop(f"Sample {self.sample_idx+1} loaded.")

    async def run(self):
        accum = 0.0
        while True:
            dt = self.clock.tick(FPS) / 1000.0
            accum += dt
            for e in pygame.event.get():
                if e.type == pygame.QUIT:
                    return
                if e.type == pygame.MOUSEBUTTONDOWN:
                    pos = e.pos
                    if self.btn_run.hit(pos):
                        self.start()
                    elif self.btn_step.hit(pos):
                        self.step_once()
                    elif self.btn_reset.hit(pos):
                        self.agent.reset()
                        self.stop("Reset.")
                    elif self.btn_maze.hit(pos):
                        self.change_maze(-1 if e.button == 3 else +1)
                    elif self.btn_sample.hit(pos):
                        self.change_sample(-1 if e.button == 3 else +1)
                    elif self.btn_spd_m.hit(pos):
                        self.speed = clamp(self.speed - 1, 1, 30)
                    elif self.btn_spd_p.hit(pos):
                        self.speed = clamp(self.speed + 1, 1, 30)
                self.editor.handle(e)

            if self.running and accum >= 1.0 / float(self.speed):
                accum = 0.0
                self.step_once()

            # draw
            self.screen.fill(BG)
            for b in (
                self.btn_run,
                self.btn_step,
                self.btn_reset,
                self.btn_maze,
                self.btn_sample,
                self.btn_spd_m,
                self.btn_spd_p,
            ):
                b.draw(self.screen, self.small)
            info = self.small.render(
                f"Speed: {self.speed} actions/s    Status: "
                f"{'Running' if self.running else 'Idle'} (right-click Maze/Sample = "
                f"previous)",
                True,
                MUTED,
            )
            self.screen.blit(info, (380, 58))
            self.editor.draw(self.screen)
            self.log.draw(self.screen)
            right = (LEFT_W, 14, WIN_W - LEFT_W - 14, WIN_H - 28)
            draw_maze(self.screen, self.maze, self.agent, right)
            pygame.display.flip()
            await asyncio.sleep(0)


# ----- entry -----
async def main():
    app = App()
    await app.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        pygame.quit()
