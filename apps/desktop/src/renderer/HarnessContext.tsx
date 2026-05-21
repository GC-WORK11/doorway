import React, { createContext, useContext, ReactNode } from 'react';
import type {
  ProjectProjection,
  ThreadProjection,
  AgentLaunchMode,
  AgentPermissionProfile,
  AgentWorktreeStrategy,
  AgentPtyMode,
  PermissionDecision,
} from '@doorway/protocol';
import { useDoorway } from './hooks';

interface HarnessStateContextType extends ReturnType<typeof useDoorway> {
  // Catch-all to allow the huge context value to typecheck during refactoring
  [key: string]: any;
}

const HarnessStateContext = createContext<HarnessStateContextType | undefined>(undefined);

export function useHarnessState(): HarnessStateContextType {
  const context = useContext(HarnessStateContext);
  if (!context) {
    throw new Error('useHarnessState must be used within a HarnessStateProvider');
  }
  return context;
}

export function HarnessStateProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: HarnessStateContextType;
}) {
  return <HarnessStateContext.Provider value={value}>{children}</HarnessStateContext.Provider>;
}
