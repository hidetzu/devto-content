---
title: "5 Git Commands Keep My AI Context in Sync Across Machines"
published: false
description: "I keep the context I hand to AI tools as plain Markdown in a git repo. A small Zig CLI syncs it between machines with five git commands; the real work was deciding what to say when one of them fails."
tags: showdev, zig, cli, git
canonical_url: ""
cover_image: ""
devto_id:
---

I keep the context I hand to AI coding tools as plain Markdown in a git repository, and a small Zig CLI called zemo syncs it between my machines. The happy path was easy: once zemo has checked that the directory is a repository root, a successful edit runs five git commands, pull, add, diff, commit and push. The real design work was deciding what zemo should say when one of them fails halfway, because a sync that fails quietly leaves you feeding the AI stale context.

An AI coding tool knows nothing about my project until I tell it. With zemo, telling it is one pipe: `zemo dump | <your AI CLI>`. No database, no sync service, no plugin.

## From two shell scripts to one binary

zemo started as shell functions in my dotfiles. I kept notes in `~/memo`, a git repository with a private remote. `memo <topic>` pulled, opened `~/memo/topics/<topic>.md` in Neovim, and committed and pushed after I quit.

I had that logic twice: in fish for macOS and Linux, and in PowerShell for Windows. Every change meant two edits in two languages that check exit codes differently, and the two drifted. A `todo` function existed only on the PowerShell side, so my Mac had no `todo` command at all.

I wanted one program that behaved the same on all three systems and needed no runtime. Once it was a real CLI, I added two read-only commands, `cat` and `dump`, so I could pipe my notes into an AI tool. That became zemo. The latest release at the time of writing is v0.4.2.

## Writing on one machine, reading on another

```bash
zemo myapp          # open <memo>/topics/myapp.md, created on first use
zemo                # open <memo>/scratch.txt
zemo sync           # commit, pull and push by hand
zemo ls             # list topic names
zemo cat myapp      # print one note to stdout, no git
zemo dump           # print scratch and every topic, no git
```

The memo directory defaults to `~/memo` and can be moved with `ZEMO_DIR`. The editor comes from `ZEMO_EDITOR`, then `VISUAL`, then `EDITOR`, then the first of `nvim`, `vim`, `vi` on `PATH`. On Windows the fallback is `nvim`, then `notepad`.

Opening a note runs this sequence when the memo directory is the root of a git work tree:

```text
git pull --rebase --no-autostash
  ├─ fails → stop before the editor (exit 1)
  └─ succeeds → open the note in your editor
       ├─ editor exits non-zero → stop without further git steps (exit 1)
       └─ editor exits 0 → git add -A → git diff --cached --quiet
            ├─ no changes → exit 0, no commit
            └─ changes → git commit → git push
```

Here is a real run with two clones of one throwaway remote, `desktop` and `laptop`, and a script standing in for the editor. Git's own output is trimmed. On the desktop, I write a note:

```console
desktop$ zemo myapp
Already up to date.
[main db1bede] docs(myapp): 2026-10-27 19:52
 1 file changed, 3 insertions(+)
 create mode 100644 topics/myapp.md
   fb7cf85..db1bede  main -> main
```

On the laptop, `zemo dump` prints nothing at first. `cat` and `dump` never run git, so they show only what is already on disk. One `zemo sync` pulls the note:

```console
laptop$ zemo dump
laptop$ zemo sync
...
 topics/myapp.md | 3 +++
No local changes
laptop$ zemo dump
=== myapp ===

# myapp

- auth: tokens are refreshed in middleware, not in the client
```

From there it is a pipe into whichever AI CLI you use. With Claude Code's print mode, for example:

```bash
{ zemo cat myapp; git diff --staged; } | claude -p "Review this staged diff against the project notes above"
```

Commit messages follow Conventional Commits: `docs(<topic>): <timestamp>` for an edit, `chore: sync <timestamp>` for `zemo sync`. So `git log -p -- topics/myapp.md` shows when each piece of context changed, and what it said before.

A GUI editor needs a flag that makes it wait, because zemo starts committing the moment the editor process exits. `ZEMO_EDITOR="code --wait"` works. The string is split on whitespace and not parsed like a shell command, so a path with spaces needs a wrapper script.

## What git gives me, and what zemo adds

Plain Markdown means any editor, `grep`, or AI tool can read the context, with no export step. Git then covers four things zemo would otherwise have to build:

- **History and diffs.** Each successful edit with changes becomes a commit.
- **Transport.** zemo calls the `git` binary as a child process instead of linking a git library, so SSH keys, credential helpers and `~/.gitconfig` keep working.
- **Hosting.** Any remote works, from GitHub to a bare repository on a home server. zemo runs no service.
- **Multi-machine sync.** Pull before editing, push after: the model I already use for code.

zemo's own job is small: choose the file, launch the editor, sequence the git calls, and refuse to sync when that would be unsafe. One refusal is easy to miss. zemo checks `git rev-parse --show-toplevel` and syncs only if the memo directory is the work-tree root. Point `ZEMO_DIR` at a subdirectory of another repository and zemo will not run `git add -A` against that parent.

## Every failure says what state you're in

v0.4.1 and v0.4.2 rewrote zemo's error messages around one rule: say what failed, what state that left, and what to do next. No message zemo writes names an internal error.

The interesting failures happen after the editor closes, when the note is already on disk. Here is a refused push:

```console
$ zemo myapp
...
zemo: could not push to the remote; git's message is above.
      The change is committed in /home/you/memo but not pushed. Push it with: git -C /home/you/memo push
$ echo $?
1
```

Git prints its own reason first, and zemo does not paraphrase it. zemo adds what git cannot know: the commit is local only, so your other machines will not see it, and here is the exact command to run.

| What failed | What already happened | Exit |
|---|---|---|
| `git pull` | Editor never opened; zemo says whether local changes, a conflict or the remote stopped it | 1 |
| Editor exited non-zero | Pull ran; nothing after the editor ran | 1 |
| Editor not found, or found but not executable | Pull ran, editor never started; zemo names it | 1 |
| `git add` / `commit` failed | Note saved, not committed | 1 |
| `git push` failed | Note committed locally, not pushed | 1 |
| `git` not installed, `.git` present | Note saved, not committed | 1 |
| No `.git` in the memo directory | Note saved, sync skipped | 0 |

The last two rows look alike but are different decisions. A memo directory without `.git` is a choice not to sync, so it exits 0. A directory with `.git` but no `git` on `PATH` means a sync you expected did not happen, so it exits 1. With git taken off `PATH`:

```console
$ zemo myapp
zemo: git is not installed or not on PATH; your note is saved in /home/you/memo but not committed.
      Install git, then run zemo sync.
```

Before v0.4.1, zemo could not tell these two apart. Opening a note with git missing skipped the sync silently and exited 0, and `zemo sync` reported "not a git repo". The first said nothing, and the second blamed the repository, when the fix was installing git.

The pull was the last case I got right. If a note is left uncommitted, say after git was missing, git refuses `pull --rebase`. My own machine never showed this, because my git config has `rebase.autoStash=true`, which stashes the change and re-applies it after the pull. When that re-apply conflicts, git leaves conflict markers in the file and still exits 0. zemo then ran `add`, `commit` and `push`. In a reproduction against v0.4.1, the markers reached the remote.

Since v0.4.2, every pull passes `--no-autostash`, whatever the user's config says. A refused pull names its cause and the way out:

```console
$ zemo myapp
error: cannot pull with rebase: You have unstaged changes.
error: Please commit or stash them.
zemo: could not pull: /home/you/memo has changes that are not committed.
      Nothing was changed. Commit and push them with zemo sync, then run the command again.
```

For that to be true, `zemo sync` had to change order: it now commits first, then pulls, then pushes. A pull that stops mid-rebase says so, and names `git rebase --continue` and `git rebase --abort`. zemo never picks a side.

## Why Zig, briefly

I came to Zig from embedded C and wanted a real project to learn it on. A tool whose behaviour two shell scripts had already pinned down let me spend the time on the language instead of the spec. I am still new to Zig, and the code shows it in places.

What Zig gave this project concretely:

- **Cross-compilation from one machine.** `zig build -Dtarget=x86_64-windows -Doptimize=ReleaseSafe` works from Linux with no extra toolchain. CI builds Linux, macOS (Intel and Apple Silicon) and Windows, all on Ubuntu runners.
- **No package dependencies.** `build.zig.zon` lists none. libc is linked for local-time formatting, and on a Linux host the default build uses Zig's bundled musl.
- **Child processes as plain argv arrays.** Running git or the editor is `std.process.spawn` with an argv slice, and the exit code drives each branch in the diagram above.

## What zemo does not do

Some of these are deliberate, and some are simply not done yet:

- **Pull on read.** `cat` and `dump` show what is on disk. On a machine you have not synced, that is stale context.
- **Choose what the AI sees.** `dump` prints scratch and every topic. Whatever you pipe goes to the AI provider, so keep secrets out of the repository and use `cat <topic>` when one note is enough.
- **Store secrets.** `git add -A` commits everything in the memo directory, and the files are not encrypted.
- **Resolve conflicts.** zemo stops with the rebase in progress, and `zemo sync` refuses to stage anything until you finish or abort it with git.
- **Set up the remote.** You clone or `git init` once yourself.
- **Prove the non-Linux builds in CI.** CI compiles macOS and Windows but runs the tests only on Linux.

zemo also has `ideas:*` commands that track ideas I still have to decide on, with status and priority in front matter. That is a separate post.

## What I'd take from this

Shared AI context does not need a service. Plain files and the git remote you already have will do. If you wrap git in a CLI, though, put the work into the failure messages: for each step, say what state the user is in and give them the one command that finishes the job.

zemo is MIT-licensed on GitHub: [github.com/hidetzu/zemo](https://github.com/hidetzu/zemo). Issues and feedback are welcome, especially from anyone running it on macOS or Windows, where CI builds the binary but never runs it.
