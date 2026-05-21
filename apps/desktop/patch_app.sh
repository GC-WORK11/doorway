sed -i '3067,3097c\                <ThreadCanvas />' src/renderer/App.tsx
sed -i '3103,3117c\              <TerminalMuxPanel />' src/renderer/App.tsx
sed -i '3122,3152c\          <ComposerDock />' src/renderer/App.tsx
sed -i '3155,3228c\          {activeSurface && activeSurface !== "terminal" && (\n            <SurfaceDrawer />\n          )}' src/renderer/App.tsx
sed -i '3059,3059c\            <WorkspaceChrome />' src/renderer/App.tsx
