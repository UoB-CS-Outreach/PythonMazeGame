/*
 * Challenge mode for the maze activity.
 *
 * A wall follower usually works the first time it is run, which is not the
 * same as being correct. Challenge mode runs the program that is currently in
 * the editor against a fixed set of freshly generated mazes, twenty-five per
 * difficulty, and counts how many it solves. Running all of them shows the
 * shape of a strategy: a wall follower passes every Easy and Medium maze, some
 * Hard and Expert ones, and no Plaza at all. The first failure can be loaded
 * into the main view and watched, since that is where the lesson is.
 *
 * The panel stays hidden until the learner first reaches the goal, with code
 * blocks or Python. Before then there is nothing to test, and a panel
 * promising 150 mazes is one more thing to take in for someone who has not
 * solved one yet. After that it tests whichever of the two is in use.
 *
 * The maze, Python and drawing all stay in maze.js; everything here goes
 * through the globalThis.mazeGame bridge it publishes. The markup is built in
 * this file so index.html only has to load challenge.css and this script.
 *
 * Wrapped in a function because this is a classic script sharing the global
 * lexical scope with tutorial.js, and two top-level consts of the same name in
 * two classic scripts is a page-breaking error.
 */

(function () {
    "use strict";

    /*
      maxSteps is per maze, counts only the learner's own lines, and is
      measured rather than guessed. The memory solver in tests/test_maze_api.py,
      which is the strategy these difficulties are meant to reward, solves all
      25 mazes of every tier. Its worst run costs:

          Easy 1,508 · Medium 3,848 · Hard 8,191
          Expert 12,769 · Plaza 10,055 · Marathon 23,975 lines

      Exploring open ground and large mazes costs lines, so one budget for all
      six would fail correct programs on the bigger difficulties and teach
      exactly the wrong lesson. A learner's solver is rarely that tidy: one
      written during development cost one and a half to three times as much.
      So each budget sits at several times the measured worst case. A program
      going round in circles never finishes anyway, so a generous budget costs
      it nothing but a few milliseconds. The tests read these numbers and fail
      if the memory solver no longer fits inside them.
    */
    const TIERS = [
        {key: "easy", label: "Easy", maxSteps: 15000},
        {key: "medium", label: "Medium", maxSteps: 30000},
        {key: "hard", label: "Hard", maxSteps: 60000},
        {key: "expert", label: "Expert", maxSteps: 90000},
        {key: "plaza", label: "Plaza", maxSteps: 120000},
        {key: "marathon", label: "Marathon", maxSteps: 180000},
    ];

    /*
      What each difficulty adds that the one before did not, in the terms the
      Harder mazes tab uses. When a run finishes, the first difficulty with an
      unsolved maze is the one to explain: a score of 96 out of 150 says
      nothing on its own, but "loops defeat a program that only follows a
      wall" is the lesson. The structures are defined in maze_generator.py.
    */
    const TIER_IDEAS = {
        easy: "Easy mazes are one winding corridor, so the program only has " +
            "to follow it round each corner.",
        medium: "Medium mazes add junctions and dead ends, so the program has " +
            "to choose a way and find its way back out of dead ends.",
        hard: "Hard mazes add loops, and a program that only follows a wall " +
            "can go round one forever. Solving them needs a program that " +
            "remembers where it has been.",
        expert: "Expert mazes add more loops and open rooms, where a program " +
            "that only follows a wall can go round forever. Solving them " +
            "needs a program that remembers where it has been.",
        plaza: "Plaza is an open hall of pillars with no wall worth " +
            "following, so the program has to explore the space itself.",
        marathon: "Marathon mazes are the biggest, and a program that wanders " +
            "too far runs out of steps before it arrives.",
    };

    /* The section of the Harder mazes tab that explains how to get past each. */
    const TIER_HELP = {
        easy: "guide-easy",
        medium: "guide-medium",
        hard: "guide-loops",
        expert: "guide-loops",
        plaza: "guide-plaza",
        marathon: "guide-memory",
    };
    /*
      Twenty-five mazes per difficulty, always seeds 1 to 25, so everyone in
      the room runs exactly the same set and a demonstrator can reproduce a
      failure by asking for that difficulty and seed again.

      Twenty-five rather than ten because ten is not enough to make the point:
      the taught right-hand solver happens to solve Hard seeds 1 to 10, so it
      only came unstuck on Expert. Over twenty-five it fails four Hard mazes,
      the first being seed 15, and twelve Expert ones. A strategy with no
      memory should not be able to pass this.
    */
    const SEEDS = Array.from({length: 25}, (unused, index) => index + 1);
    const TOTAL_MAZES = TIERS.length * SEEDS.length;

    /*
      A second safety net, for a program that loops without calling anything.
      Python itself is fast here, spending milliseconds on a maze it solves,
      so this is generous.
    */
    const CHALLENGE_MAX_SECONDS = 3;

    const IDLE_STATUS = "Not run yet.";

    const state = {
        running: false,
        stopRequested: false,
        /* The mode of the program being tested, "blocks" or "python". */
        mode: "python",
        unlocked: false,
        failure: null,
        results: new Map(),
    };

    /* Filled in by buildPanel(). */
    const elements = {};

    /* Small helper so the markup below reads as a shape rather than as calls. */
    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function buildTierRow(tier) {
        const row = createElement("li", "challenge-tier");
        row.dataset.tier = tier.key;

        row.appendChild(createElement("span", "challenge-tier-name", tier.label));

        /*
          The squares repeat what the row's result text already says. Forty
          separate announcements would drown the live region, so the squares
          are decorative and the text carries the meaning.
        */
        const cells = createElement("span", "challenge-tier-cells");
        cells.setAttribute("aria-hidden", "true");

        const cellElements = new Map();
        SEEDS.forEach(seed => {
            const cell = createElement("span", "challenge-cell", String(seed));
            cell.dataset.state = "pending";
            cell.title = `${tier.label} maze ${seed}: not run yet`;
            cells.appendChild(cell);
            cellElements.set(seed, cell);
        });
        row.appendChild(cells);

        const result = createElement("span", "challenge-tier-result", "Not run");
        row.appendChild(result);

        elements.tiers.set(tier.key, {row, cells: cellElements, result});
        return row;
    }

    function buildPanel() {
        const panel = createElement("section", "challenge-panel");
        panel.setAttribute("aria-labelledby", "challenge-title");

        const heading = createElement("h2", "challenge-heading", "Challenge mode");
        heading.id = "challenge-title";
        panel.appendChild(heading);

        panel.appendChild(createElement(
            "p",
            "challenge-intro",
            `Runs your program against ${TOTAL_MAZES} freshly generated ` +
            "mazes, from Easy to Marathon, and counts how many it solves.",
        ));

        const actions = createElement("div", "challenge-actions");
        elements.startButton = createElement(
            "button", "challenge-start", `Run challenge (${TOTAL_MAZES} mazes)`,
        );
        elements.startButton.type = "button";
        elements.startButton.disabled = true;
        elements.startButton.addEventListener("click", runChallenge);
        actions.appendChild(elements.startButton);

        elements.stopButton = createElement("button", "challenge-stop", "Stop");
        elements.stopButton.type = "button";
        elements.stopButton.hidden = true;
        elements.stopButton.addEventListener("click", () => {
            state.stopRequested = true;
        });
        actions.appendChild(elements.stopButton);

        elements.summary = createElement("p", "challenge-summary");
        elements.summary.hidden = true;
        actions.appendChild(elements.summary);
        panel.appendChild(actions);

        const progress = createElement("div", "challenge-progress");
        progress.setAttribute("role", "status");
        progress.setAttribute("aria-live", "polite");

        elements.status = createElement("p", "challenge-status", "Starting up…");
        progress.appendChild(elements.status);

        /*
          From the explanation to the part of the Harder mazes tab that shows
          what to do about it. That tab is about Python, and code blocks mode
          hides it, so the link goes too (.for-python).
        */
        elements.helpLink = createElement(
            "button", "challenge-help-link for-python", "How to solve these",
        );
        elements.helpLink.type = "button";
        elements.helpLink.hidden = true;
        elements.helpLink.addEventListener("click", () => {
            const tier = firstUnsolvedTier();
            if (tier) globalThis.mazeGame?.showHelp(TIER_HELP[tier.key]);
        });
        progress.appendChild(elements.helpLink);

        elements.tiers = new Map();
        const list = createElement("ol", "challenge-tier-list");
        TIERS.forEach(tier => list.appendChild(buildTierRow(tier)));
        progress.appendChild(list);
        panel.appendChild(progress);

        /*
          The failure card is the whole point of the feature: seeing the
          triangle circle a wall island forever teaches more than any number
          of passes, so it is deliberately loud.
        */
        elements.failure = createElement("div", "challenge-failure");
        elements.failure.hidden = true;
        elements.failureTitle = createElement("p", "challenge-failure-title");
        elements.failureText = createElement("p", "challenge-failure-text");
        elements.loadButton = createElement(
            "button", "challenge-load", "Load this maze and watch",
        );
        elements.loadButton.type = "button";
        elements.loadButton.addEventListener("click", loadFailingMaze);
        elements.failure.appendChild(elements.failureTitle);
        elements.failure.appendChild(elements.failureText);
        elements.failure.appendChild(elements.loadButton);
        panel.appendChild(elements.failure);

        return panel;
    }

    /*
      Mount into an existing #challenge-mode element if index.html provides
      one, so the panel can be placed wherever the page layout wants it.
      Otherwise fall back to the end of #app, which does not depend on the
      rest of the page's structure. Clearing the mount point first means
      re-loading this file during development replaces the panel instead of
      stacking a second one.
    */
    function mountPanel() {
        let mount = document.getElementById("challenge-mode");
        if (!mount) {
            mount = document.createElement("div");
            mount.id = "challenge-mode";
            (document.getElementById("app") || document.body).appendChild(mount);
        }

        mount.textContent = "";
        mount.hidden = !state.unlocked;
        mount.appendChild(buildPanel());
    }

    function unlock() {
        state.unlocked = true;
        document.getElementById("challenge-mode").hidden = false;
    }

    /*
      The first time a program reaches the goal, open the panel and offer to
      run it straight away. Either answer leaves the panel open.
    */
    async function offerChallenge() {
        const game = globalThis.mazeGame;
        if (state.unlocked || !game) return;
        unlock();

        /*
          Someone who has only used code blocks has just written a real
          program without typing any of it. Seeing it as Python is the
          moment that shows them, so code blocks mode offers that as well.
        */
        const blocksMode = game.getMode() === "blocks";
        const choice = await game.showGoalDialog({
            title: "You reached the goal",
            text: "Challenge mode is now open at the bottom of the page. It " +
                `runs your program on ${TOTAL_MAZES} new mazes, from Easy to ` +
                "Marathon, and counts how many it solves." +
                (blocksMode ? " Your blocks are also a real Python program." : ""),
            action: "Run the challenge",
            extra: blocksMode ? "See it as Python" : "",
        });
        if (choice === "extra") {
            globalThis.mazeBlocks?.convertToPython();
            return;
        }
        if (choice !== "action") return;

        const panel = document.getElementById("challenge-mode");
        panel.scrollIntoView({behavior: scrollBehavior(), block: "start"});
        runChallenge();
    }

    function setStatus(message, isError) {
        elements.status.textContent = message;
        elements.status.classList.toggle("challenge-status-error", Boolean(isError));
    }

    function markCell(tier, seed, cellState, title) {
        const cell = elements.tiers.get(tier.key).cells.get(seed);
        cell.dataset.state = cellState;
        cell.title = title;
        if (cellState === "pass") cell.textContent = "✓";
        if (cellState === "fail") cell.textContent = "✗";
        if (cellState === "skipped") cell.textContent = "·";
        if (cellState === "pending") cell.textContent = String(seed);
    }

    function average(values) {
        const total = values.reduce((sum, value) => sum + value, 0);
        return Math.round(total / values.length);
    }

    /*
      Par is the moves used divided by the shortest route, so 1.0 is a perfect
      line to the goal and 3.0 means walking three times further than needed.
      Reaching the goal is the pass mark; par is the score, and it gives a
      learner whose solver already works something to improve.
    */
    function parFor(results) {
        const ratios = results
            .filter(result => result.reached && result.shortest > 0)
            .map(result => result.moves / result.shortest);
        if (ratios.length === 0) return null;
        return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    }

    /* One line per difficulty: how many were solved and how efficiently. */
    function describeTier(tier, results) {
        if (results.length === 0) return "Not run";

        const solved = results.filter(result => result.reached);
        let text = `${solved.length}/${SEEDS.length} solved`;

        if (solved.length > 0) {
            const moves = average(solved.map(result => result.moves));
            text += ` · ${moves} moves on average (${parFor(results).toFixed(1)}× par)`;
        }
        const firstFailure = results.find(result => !result.reached);
        if (firstFailure) text += ` · first failed on maze ${firstFailure.seed}`;
        return text;
    }

    function updateTier(tier) {
        const results = state.results.get(tier.key) || [];
        elements.tiers.get(tier.key).result.textContent = describeTier(tier, results);
    }

    /* "Easy", "Easy and Medium", "Easy, Medium and Hard". */
    function listLabels(labels) {
        if (labels.length < 2) return labels.join("");
        return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    }

    /*
      Turn a finished run into one or two sentences about what the program
      can and cannot do: which difficulties it solved completely, and what
      the first one it could not solve adds.
    */
    function firstUnsolvedTier() {
        return TIERS.find(tier =>
            (state.results.get(tier.key) || []).some(result => !result.reached),
        );
    }

    function explainResult() {
        const firstUnsolved = firstUnsolvedTier();
        if (!firstUnsolved) return "";

        const solved = TIERS.slice(0, TIERS.indexOf(firstUnsolved))
            .map(tier => tier.label);
        const opening = solved.length > 0
            ? `Every ${listLabels(solved)} maze was solved.`
            : "Not every Easy maze was solved.";
        return `${opening} ${TIER_IDEAS[firstUnsolved.key]}`;
    }

    /*
      One headline figure. The per-difficulty breakdown is on the rows just
      below, so repeating it here only made a long unreadable line.
    */
    function updateSummary() {
        elements.summary.hidden = false;
        const allResults = [...state.results.values()].flat();
        const solvedTotal = allResults.filter(result => result.reached).length;
        const par = parFor(allResults);

        elements.summary.textContent = par === null
            ? `${solvedTotal} of ${TOTAL_MAZES} solved`
            : `${solvedTotal} of ${TOTAL_MAZES} solved · ${par.toFixed(1)}× par`;
    }

    function resetProgress() {
        state.failure = null;
        state.results = new Map();
        elements.failure.hidden = true;
        elements.summary.hidden = true;
        elements.helpLink.hidden = true;

        TIERS.forEach(tier => {
            SEEDS.forEach(seed => {
                const label = `${tier.label} maze ${seed}: not run yet`;
                markCell(tier, seed, "pending", label);
            });
            elements.tiers.get(tier.key).result.textContent = "Not run";
        });
    }

    /* Explain a failure in the terms the activity uses, not in Python terms. */
    function describeFailure(result) {
        if (result.reason === "stuck") {
            const watch = " Load the maze below to see what it is doing.";
            // A program turning on the spot makes no moves at all, and one
            // that barely moved has nothing worth comparing with the route.
            if (result.moves === 0) {
                return "It ran for a long time without moving the triangle, and " +
                    "was still going when the run was cut short." + watch;
            }
            const times = Math.round(result.moves / Math.max(1, result.shortest));
            const compared = times >= 2
                ? `, roughly ${times} times the ${result.shortest} moves the ` +
                  "shortest route needs,"
                : "";
            return (
                `It made ${result.moves.toLocaleString()} moves without reaching ` +
                `the goal${compared} and was still going when the run was cut ` +
                "short." + watch
            );
        }
        if (result.reason === "error") {
            return state.mode === "blocks"
                ? describeBlocksError(result)
                : `Your program stopped with an error: ${result.error}`;
        }
        return (
            `Your program finished after ${result.moves} moves without reaching ` +
            `the goal. The shortest route is ${result.shortest} moves.`
        );
    }

    /*
      Plain words for code blocks, as maze.js gives after a normal run. The
      error itself says "Try checking path_ahead() before move()", naming
      Python that someone using blocks has never seen. Walking into a wall
      is the only error blocks can make; anything else is passed on as is.
    */
    function describeBlocksError(result) {
        if (!/^RuntimeError: (Wall ahead|Can't move)/.test(result.error)) {
            return `The code blocks stopped with an error: ${result.error}`;
        }
        const moves = result.moves;
        const when = moves === 0
            ? "on its first move"
            : `after ${moves.toLocaleString()} ${moves === 1 ? "move" : "moves"}`;
        return `The triangle walked into a wall ${when}. Load the maze below ` +
            "to see which block did it.";
    }

    function showFailure(tier, result, watchable) {
        state.failure = result;
        elements.failureTitle.textContent =
            `${tier.label} maze ${result.seed} was not solved`;
        elements.failureText.textContent = describeFailure(result);
        elements.loadButton.hidden = !watchable;
        elements.failure.hidden = false;
        elements.failure.scrollIntoView({block: "nearest"});
    }

    /* Scrolling the page for the user is motion, so it is opt-out. */
    function scrollBehavior() {
        const reduced = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
        return reduced.matches ? "auto" : "smooth";
    }

    async function loadFailingMaze() {
        const result = state.failure;
        if (!result || state.running) return;

        const tier = TIERS.find(entry => entry.key === result.level);
        elements.loadButton.disabled = true;
        try {
            await globalThis.mazeGame.loadMazeText(
                result.maze,
                result.level,
                `Challenge maze loaded: ${tier.label} maze ${result.seed}. ` +
                "Select Run program to watch what your solver does on it.",
            );
            const canvas = document.getElementById("mazeCanvas");
            if (canvas) {
                canvas.scrollIntoView({behavior: scrollBehavior(), block: "center"});
            }
            const runButton = document.getElementById("runBtn");
            if (runButton) runButton.focus();
        } catch (error) {
            setStatus(`Could not load that maze: ${error}`, true);
        } finally {
            elements.loadButton.disabled = false;
        }
    }

    /*
      A task that the browser runs promptly even in a background tab, unlike
      setTimeout, which it clamps to roughly one second there.
    */
    function yieldToEventLoop(callback) {
        const channel = new MessageChannel();
        channel.port1.onmessage = callback;
        channel.port2.postMessage(null);
    }

    /*
      Hand control back to the browser between mazes. Without this the forty
      Pyodide calls would run back to back in one task and the progress grid
      would only appear once the whole run had finished.

      While the page is visible, waiting for an animation frame is the reliable
      signal that the grid really has been drawn, and it paces the run at about
      one maze per frame so the squares can be seen filling in. A hidden page
      never runs animation frames at all, so it yields through a message
      channel instead: there is nothing to draw, and a pupil who switches tabs
      must not come back to a run that has stalled. The timer is the last
      resort for a page that is visible but still not drawing, such as a
      window covered by another, which would otherwise wait forever.
    */
    function nextPaint() {
        return new Promise(resolve => {
            let resolved = false;

            function finish() {
                if (resolved) return;
                resolved = true;
                document.removeEventListener("visibilitychange", onVisibilityChange);
                resolve();
            }

            function onVisibilityChange() {
                if (document.hidden) yieldToEventLoop(finish);
            }

            requestAnimationFrame(finish);
            setTimeout(finish, 100);

            if (document.hidden) {
                yieldToEventLoop(finish);
            } else {
                document.addEventListener("visibilitychange", onVisibilityChange);
            }
        });
    }

    /* One maze per Pyodide call, so each call is short. */
    async function runOneMaze(tier, seed) {
        const game = globalThis.mazeGame;
        await game.setGlobal("PMG_CHALLENGE_LEVEL", tier.key);
        await game.setGlobal("PMG_CHALLENGE_SEED", seed);
        await game.setGlobal("PMG_CHALLENGE_MAX_STEPS", tier.maxSteps);

        const json = await game.runPython(
            "run_challenge_maze(PMG_CHALLENGE_SRC, PMG_CHALLENGE_LEVEL, " +
            "PMG_CHALLENGE_SEED, PMG_CHALLENGE_MAX_STEPS, " +
            "PMG_CHALLENGE_MAX_SECONDS)",
        );
        return JSON.parse(String(json));
    }

    async function runChallenge() {
        if (state.running) return;

        const game = globalThis.mazeGame;
        if (!game) return;

        state.running = true;
        state.stopRequested = false;
        resetProgress();
        elements.startButton.disabled = true;
        elements.stopButton.hidden = false;
        game.setBusy(true);
        game.setStatus("Running the challenge…");
        // An open tutorial card moves aside so the panel can be used.
        document.dispatchEvent(new CustomEvent("challenge:start"));

        let failed = null;
        let cannotStart = false;

        try {
            await game.ready();
            state.mode = game.getMode();
            await game.setGlobal("PMG_CHALLENGE_SRC", game.getCode());
            await game.setGlobal("PMG_CHALLENGE_MAX_SECONDS", CHALLENGE_MAX_SECONDS);

            for (const tier of TIERS) {
                const results = [];
                state.results.set(tier.key, results);

                for (const seed of SEEDS) {
                    if (state.stopRequested || cannotStart) break;

                    setStatus(
                        `Running ${tier.label} maze ${seed} of ${SEEDS.length}…`,
                    );
                    const label = `${tier.label} maze ${seed}`;
                    markCell(tier, seed, "running", `${label}: running`);

                    /*
                      One yield per maze, taken before the Python call: it
                      paints this maze's "running" marker and the previous
                      maze's result together, so the grid fills in visibly
                      without costing two pauses per maze.
                    */
                    await nextPaint();

                    const result = await runOneMaze(tier, seed);
                    results.push(result);

                    markCell(
                        tier,
                        seed,
                        result.reached ? "pass" : "fail",
                        result.reached
                            ? `${label}: solved in ${result.moves} moves`
                            : `${label}: not solved`,
                    );
                    updateTier(tier);
                    updateSummary();

                    if (!result.reached && !failed) failed = {tier, result};

                    // A program that cannot even be read fails every maze
                    // the same way, so 150 crosses would add nothing.
                    cannotStart = /^(SyntaxError|IndentationError|TabError)/
                        .test(result.error);
                }

                if (state.stopRequested || cannotStart) break;
            }

            // A program that cannot be read does nothing worth watching.
            if (failed) showFailure(failed.tier, failed.result, !cannotStart);

            if (state.stopRequested) {
                setStatus("Challenge stopped.");
            } else if (cannotStart) {
                setStatus("Your program has an error, so no maze could be run.");
            } else if (failed) {
                setStatus(explainResult());
                elements.helpLink.hidden = false;
            } else {
                setStatus(
                    `All ${TOTAL_MAZES} mazes solved. Your program is not ` +
                    "just lucky.",
                );
            }
        } catch (error) {
            setStatus(`The challenge could not finish: ${error}`, true);
        } finally {
            state.running = false;
            elements.startButton.disabled = false;
            elements.stopButton.hidden = true;
            game.setBusy(false);
            game.setStatus(
                failed && !cannotStart ? "Load the failing maze to watch it." : "",
            );
        }
    }

    /*
      maze.js awaits its first maze file before publishing the bridge, so this
      script can load before globalThis.mazeGame exists however it is included.
    */
    function waitForBridge() {
        return new Promise((resolve, reject) => {
            const giveUpAt = Date.now() + 60000;

            function check() {
                if (globalThis.mazeGame) {
                    resolve(globalThis.mazeGame);
                } else if (Date.now() > giveUpAt) {
                    reject(new Error("maze.js did not finish loading"));
                } else {
                    setTimeout(check, 50);
                }
            }

            check();
        });
    }

    function init() {
        mountPanel();

        waitForBridge()
            .then(game => game.ready())
            .then(() => {
                elements.startButton.disabled = false;
                setStatus(IDLE_STATUS);
            })
            .catch(error => {
                setStatus(`Challenge mode is unavailable: ${error.message}`, true);
            });

        document.addEventListener("maze:goal-reached", offerChallenge);

        /* A small hook for the console and for automated checks. */
        globalThis.challengeMode = {
            run: runChallenge,
            unlock,
            stop: () => {
                state.stopRequested = true;
            },
            isRunning: () => state.running,
            results: () => Object.fromEntries(state.results),
            failure: () => state.failure,
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}());
