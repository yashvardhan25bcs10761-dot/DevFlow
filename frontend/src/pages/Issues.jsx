import React from 'react';
import WorkItemsPage from './WorkItemsPage';
import { useRepositoryLayout } from '../components/Navbar';

export default function Issues() {
  const { selectedRepo, refreshTick } = useRepositoryLayout();
  return <WorkItemsPage kind="issues" repository={selectedRepo} refreshTick={refreshTick} />;
}
