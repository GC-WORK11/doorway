#first main feature is that
doorway if very good loking now when a user chat and lets said in the coding chat he said @claude @codex do this then dude in the terminal layer which is our main stuff we arent using
any sdk wrapping or ads or api wrapping our harnes acutally uses the terminalk and with the particular pronopt launches the claude and codex with a delegated praarraler prompt which
is delegation done by the brain of doorway which itseld is a api wrapper but a smart self evolving and adapting harness now dude here is the we dleedgate task amongs cli and then dude
we arent using the pty its like 90s tech we are using teh greatest smarted state of the art terminal controling which includes caprturing seeing wacthig running finding faults and
reruning dude evrything dude so advance termianl harness that lets say if a prompt to claude accidentally faioled or terminal failed our doorway harnes launch another one dude and not
only thaty lets say if a work has done by codex ut claude is still running dude our frontend doorway which beautifull sayd codex finishde and here is what done chnages liek cursor and
stuff shows ther work hwile dude claude in between asked a question in terminla our harness houls be strong to dude follow up using the user existing prompt or can ask user in our
chat then reprompt claude overal is like user directly taking to cluade and codex dude the mainissue we arentusing sdk method like t3 code or conductor cause dude many compniaes are
shiting that they force user if wanna use subsidides subscription use their harnes but user want niceer ui thats why we have cinductior and t3 code but dude not since these cli
comopanies chnaging policies if someone use sdk methor to call or prorammatic method then will charge api billing dude but they said if someone in the world make a breakthrough to run
cli in terminal mode interactive mode like humans that wil be a great achievemmemt so dude this is like one of the feature dude now seRch for all comptertions dude we have warp sentry
and doghog to learn of terminl and for ui we have cursor codex etc so dude this is like the main feature you need to do the internet reserach to understand the features of that dude that reading terminal is a state of the art thing dude i mean simply i cant dudejust go ahead use pty its is cheap we have to create a cross os whifch work in mac , windows and lunux ddude state if the art terminal usig like doorwya uses it like a human dude 
second features dude 
other features is dude the self adapting of the doorway dude current ide are hardocded they are so mature and great though but they cant  adapt mean as per the projkect and stuff dude lets say during the converarion or the ide is working i cant ask ide that i am going out setup yourslef on autocompact mode cause it might not have one dude but our doorway must be abke to adapt and chnage itsel dude like the pi agent do even thougb pi is so advance but its a terminal we like a ide to do that dude 
third feature is dude cross threading mean dude the reasoin us een thugh doorway laucnhes terminal cli like human but dude teh main feature of cursor and otehr is muktiple model using ,ultipek tool and api call but a unified thread dude the context is also merges and univeral mean ddude the final ui as outpu and doorwya wil show and save is lke no matter how many terminal working doorway show like one thread or chat unless new thread is created that why when doorway delegqtes it creates it own prompt prefill with conect so other stuff coworkd together and as a output doorwa shows a unified beauituful chat
fourth feature dude 
from cowork i understood current ides can alunc subagents dude harness we want that but dude current subagents can laucnh as peer to peer cowrokes means we orchestrate them so deep that they start acting like real corwokred these cli and then insted sometime doorway do it sometimes thery thermewsleves talk to themesles dude authrogty this ened to changet eh configd of officla cli insystem 
fifth fearrueus dude brtually with codex desktop app dude the most important feature is pluging icodex has more then 300 plugins that why dude nowaydas people dont even run thing they just ask codex to do from dude gmails reading to book writing to pr checgking to mathes solving to coding shipping sofwater projduct dude we also want our own pluging oauth conenction infrstrcurre dude as it from codex desktop app to learn dude 
sixth feature dude which is that /slash commands dude i shouls be able to have lie claude has 40 slahs comands likem model selector login logout help thinling compact goal loop and dude contunue and dude some smart pugin like browser use and computer use i want these too dude 
sventh feature
dude automation nowawsys people want to schedule and automate thing lets say should, be jusst make a prompt put some puging and resource set times and then boom it wokrs on its own lie i before going to sleep i schedule a automation for pr checkingandgithub actions cheking at morning i ahve the uipdate as a report dude learn from ai workflows of online latest dyde 
eight fearure dude 
the goat slicong valley level uncicorn yv backned sleek minmal frontend like raycast linear vercel cursor conductor and other 

nineth and main and dude i didnt wern in techincel feature dude whihc are like worktree thread terminal actions documetb creations dude overviwe revies plan provider dude and connector and more there are ore techincal pillars  BRUTAL DOORWAY CODE REVIEW: 9-FEATURE AUDIT

This audit scores the Doorway AI IDE architecture against the absolute state-of-the-art features expected of a "Silicon Valley Unicorn" IDE (e.g., Cursor, Windsurf, Conductor, Codex Desktop App, Warp).

---

## OVERALL VERDICT: 5.2/10

```
┌────────────────────────────────────────────────────────────────────────────┐
     │
│   However, Doorway fails critically on modern automation, deep plugin      │
│   ecosystems, and dynamic subagent orchestration. It is a beautifully      │
│   styled, highly capable chat shell that needs massive backend capability  │
│   expansion to compete with Codex and Devin.                               │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Terminal Harness (Advanced PTY Alternative)
**RATING: 8/10**
- **State-of-the-Art:** Warp and Cursor use Headless Terminal Emulation (parsing 2D ANSI buffers) and Shell Integration (injecting invisible profile markers) to isolate command outputs without using SDK wrappers. Conductor isolates parallel agents via Git Worktrees.
- **Doorway Reality:** We use standard `node-pty`. We have solid process tree tracking and exit code parsing. We also isolate parallel execution via worktrees. However, we lack true "Shell Integration" markers to perfectly slice CLI output blocks natively.

## 2. Self-Adapting IDE
**RATING: 3/10**
- **State-of-the-Art:** Pi Agent dynamically meta-programs its tools and reloads profiles via `SYSTEM.md`. Windsurf auto-compacts its UI seamlessly to keep developers "in flow".
- **Doorway Reality:** `ProjectMemoryLoader` reads `AGENTS.md` to adapt context, but the frontend React UI is completely rigid. There is no auto-compacting feature or dynamic tool-building logic.

## 3. Cross-Threading (Unified Context)
**RATING: 10/10**
- **State-of-the-Art:** Multiple agents working across parallel worktrees resolving into a single unified timeline/dashboard.
- **Doorway Reality:** PERFECT. `ThreadCanvas.tsx` dynamically splits into responsive flexbox lanes based on active agents (`lanes.length > 1`), unifying parallel outputs into one beautiful, scrollable canvas without muddying the logs.

## 4. Subagent Orchestration (Peer-to-Peer)
**RATING: 4/10**
- **State-of-the-Art:** Agent Teams (Choreography) where agents negotiate, chat via mailboxes, and safely modify system configs using strictly sandboxed Docker/VM environments.
- **Doorway Reality:** Doorway orchestrates top-down. The `FlightRecorder` tracks actions, but agents do not communicate peer-to-peer. They cannot modify core CLI configs dynamically without breaking security profiles.

## 5. Plugin Store & OAuth Infrastructure
**RATING: 1/10**
- **State-of-the-Art:** 300+ plugins powered by Model Context Protocol (MCP) servers, utilizing OAuth 2.0 Token Exchange and CIBA for Human-in-the-loop (HITL) granular approvals (Codex Desktop).
- **Doorway Reality:** Missing. We have rudimentary hardcoded adapters (`codex`, `claude`) but zero marketplace, OAuth flows, or MCP server integration.

## 6. Slash Commands Expansion
**RATING: 2/10**
- **State-of-the-Art:** 40+ commands providing instant triggers for everything from model selection to browser usage (`/computer-use`).
- **Doorway Reality:** `App.tsx` has only 9 hardcoded commands (`/build`, `/debug`, `/plan`, etc.). 

## 7. Automation & Workflows
**RATING: 1/10**
- **State-of-the-Art:** Deep integration with CI/CD (GitHub Actions) utilizing POSIX crons, securely passing GitHub Model API keys to trigger overnight PR reviews.
- **Doorway Reality:** Doorway is purely synchronous. No background scheduling daemon or cron system exists inside the engine.


## 9. Technical Pillars (Data, Docs, Providers)
**RATING: 8/10**
- **State-of-the-Art:** Event-sourcing, strict evidence types, and robust persistence.
- **Doorway Reality:** Excellent. `packages/core` features 35+ SQLite tables, an immutable `FlightRecorder` ledger, and explicit evidence schemas. Minor deductions for storing diffs as JSON instead of structured blob normalization.
