# Capture Test

Capture is automatic and verified in two separate Claude Code sessions. Both canaries, prompt and response, landed in `.agent-logs/`, each session in its own file.

## 1. Tool and model

* **Tool:** Claude Code 2.1.285, run from the VS Code extension.
* **Model:** Claude Opus 5.5 (`claude-opus-5-5`). The same model plans and executes.
  No subagents or second model are used.

## 2. Mechanism and config file

Claude Code hooks, which are commands Claude Code runs by itself on lifecycle events.

* **Config file changed:** [`.claude/settings.json`](.claude/settings.json). It wires
  three events to one script:
  * `SessionStart`: caches the model if the payload carries one.
  * `UserPromptSubmit`: appends the prompt, verbatim, with a UTC timestamp.
  * `Stop` (end of turn): appends the final response, read from the hook payload, or
    from the session transcript whose path the hook receives on stdin.
* **Script:** [`.claude/hooks/capture.py`](.claude/hooks/capture.py). It writes one file
  per session in the format from the brief and rewrites the front matter
  (`total_exchanges`, `last_prompt_time`, `model`) on every append.

Nothing has to be run by hand. The settings file is in the repo, so every new session
opened in this repo picks the hooks up.

## 3. Log files the canaries landed in

* Canary 1 (session `b8e6a366`):
  [`.agent-logs/2026-09-30_15-05-32_b8e6a366-41ba-4be7-8f90-b5aaa0bb710c.md`](.agent-logs/2026-09-30_15-05-32_b8e6a366-41ba-4be7-8f90-b5aaa0bb710c.md)
  as exchange 2. Exchange 1 in that file is the setup brief itself.
* Canary 2 (session `2f9ac65a`, a new chat):
  [`.agent-logs/2026-09-30_15-25-39_2f9ac65a-dcb7-4d2c-a11c-84e0e8d82cd9.md`](.agent-logs/2026-09-30_15-25-39_2f9ac65a-dcb7-4d2c-a11c-84e0e8d82cd9.md)
  as exchange 1.

## 4. Canary entries, raw

Copied byte for byte from the log files by a script, not retyped. Each block is the
PROMPT entry and its RESPONSE entry exactly as they appear in the log, trailing blank
lines included.

### Canary 1

````text
[LOG_ENTRY type=PROMPT num=2 session=b8e6a366]
timestamp: 2026-09-30T15:22:08.471Z
model: claude-opus-5-5

<ide_opened_file>The user opened the file /Users/abdelmalekmaskri/Desktop/amazon-rebuild-8x/.claude/settings.json in the IDE. This may or may not be related to the current task.</ide_opened_file>
CAPTURE TEST – 8x assignment, Abdelmalek Maskri


[LOG_ENTRY type=RESPONSE num=2 session=b8e6a366]
timestamp: 2026-09-30T15:22:31.583Z
model: claude-opus-5-5

The capture hook you installed works in this session. Your canary prompt is already in the log as entry 2.

**What landed** in [.agent-logs/2026-09-30_15-05-32_b8e6a366-41ba-4be7-8f90-b5aaa0bb710c.md](.agent-logs/2026-09-30_15-05-32_b8e6a366-41ba-4be7-8f90-b5aaa0bb710c.md):
* **PROMPT 1:** the setup brief, which the `Stop` hook recovered from the transcript because the hook didn't exist yet when you sent it.
* **RESPONSE 1:** a response to that brief.
* **PROMPT 2:** this canary, verbatim, at `2026-09-30T15:22:08.471Z`, model `claude-opus-5-5`. It also includes a line the editor added, saying you had opened `.claude/settings.json`. That line is part of what reached me, so leaving it in keeps the prompt verbatim.
* The header shows `total_exchanges: 2`. The indented example entries from the brief, which the log quotes, were not counted as real entries.

**Not confirmed yet:**
* **This response.** It gets written when this turn ends, so I can't see it from inside the turn. After I reply, run `tail -20 .agent-logs/*b8e6a366*.md` and you should see `RESPONSE num=2` holding this message.
* **Response 1 may not be my last reply.** It says Google Drive, Notion and papersflow need signing in, and that this task doesn't need them. My last reply said nothing of the kind. Compare it with what you saw before `CAPTURE-TEST.md` quotes it.
* **Second session.** Open a new Claude Code session in this repo and send the canary again. It should create a second file in `.agent-logs/` named with that session's ID.

Once both are green, I'll write `CAPTURE-TEST.md` with the raw canary entries pasted in. Nothing is committed yet. The repo has no commits, and I'll wait for your go before making the first one.


````

### Canary 2

````text
[LOG_ENTRY type=PROMPT num=1 session=2f9ac65a]
timestamp: 2026-09-30T15:25:39.667Z
model: opus

<ide_opened_file>The user opened the file /Users/abdelmalekmaskri/Desktop/amazon-rebuild-8x/.agent-logs/2026-09-30_15-05-32_b8e6a366-41ba-4be7-8f90-b5aaa0bb710c.md in the IDE. This may or may not be related to the current task.</ide_opened_file>
CAPTURE TEST 2 – 8x assignment, Abdelmalek Maskri


[LOG_ENTRY type=RESPONSE num=1 session=2f9ac65a]
timestamp: 2026-09-30T15:25:52.757Z
model: claude-opus-5-5

Capture test 2 worked. The hook created a new log for this session: [.agent-logs/2026-09-30_15-25-39_2f9ac65a-dcb7-4d2c-a11c-84e0e8d82cd9.md](.agent-logs/2026-09-30_15-25-39_2f9ac65a-dcb7-4d2c-a11c-84e0e8d82cd9.md).

* **Metadata is correct:** session `2f9ac65a`, author `abdelmalek-maskri`, model `opus`, project `amazon-rebuild-8x`.
* **Your prompt was logged** as entry 1 at 15:25:39.
* **The IDE context was logged too.** The `<ide_opened_file>` tag was stored along with your text. If you only want what you typed, the hook needs to strip that tag.
* **My reply isn't in the log yet.** The hook probably writes it when the turn ends. Open the file after this message to check it shows up.


````

## 5. What did not work at first

* **Wrong prompt field.** The hooks docs name the prompt field `user_input`, but the
  real `UserPromptSubmit` payload sends `prompt`. I found this by dumping real payloads.
  The script reads `prompt` and falls back to `user_input`.
* **Model logged as `unknown`.** No hook payload carries the model, and `SessionStart`
  sent no `model` field. The first end to end run logged `model: unknown`, because at
  `Stop` the transcript had not yet been flushed with the reply that names the model.
  The script now waits up to 3 seconds for the transcript to catch up, then remembers
  the model for the rest of the session.
* **First prompt of a session shows the alias.** When a prompt is submitted, the model
  has not answered yet, so the only source is the `model` setting, which is the alias
  `opus`. That is why canary 2's PROMPT entry says `model: opus` while its RESPONSE says
  `model: claude-opus-5-5`. Every later entry in a session shows the full ID.
* **The setup message was sent before the hooks existed.** So `UserPromptSubmit` never
  fired for it. The `Stop` hook notices the missing PROMPT entry and recovers it from
  the transcript, which is how exchange 1 of the first log was recorded.
* **Editor context is part of the prompt.** The VS Code extension adds an
  `<ide_opened_file>` line to each prompt, naming the file open at the time. It is left
  in, because that is the text the model actually received.
* **Canary dash.** The brief's canary uses an em dash (`CAPTURE TEST — ...`). I typed an
  en dash (`–`). The log keeps what I actually typed.
