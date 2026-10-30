# Contributing to Thoondil

Thoondil aims to stay small, local-first, and truthful about what it captures and replays.

## Before changing code

Open an issue to discuss large behavior or architecture changes. For a focused bug fix, a pull request with a clear reproduction is enough. Do not include real webhook secrets, tokens, or private payloads in issues, tests, screenshots, or pull requests.

## Run locally

```bash
python3 server.py
python3 -m unittest discover -s tests -v
```

The runtime uses only Python's standard library. The frontend is plain HTML, CSS, and JavaScript, and the docs site is static HTML/CSS under `docs/`.

## Pull requests

- Explain the developer problem and the behavior you changed.
- Add a meaningful test when changing capture, replay, response rules, or API behavior.
- Update the README and docs when behavior or limits change.
- For UI changes, include desktop and narrow-screen screenshots taken from the running app.
- Keep examples synthetic and credentials out of the repository.

The maintainers may ask for a smaller change if a proposal adds infrastructure or dependencies without a clear benefit to the core viewer.