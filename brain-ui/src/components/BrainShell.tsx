import type { ReactNode } from "react";

interface BrainShellProps {
  topBar: ReactNode;
  leftSidebar: ReactNode;
  graphPanel: ReactNode;
  rightPanel: ReactNode;
}

export const BrainShell = ({
  topBar,
  leftSidebar,
  graphPanel,
  rightPanel,
}: BrainShellProps) => (
  <div className="app">
    {topBar}
    {leftSidebar}
    {graphPanel}
    <aside className="inspector">
      <div className="pane">{rightPanel}</div>
    </aside>
  </div>
);
