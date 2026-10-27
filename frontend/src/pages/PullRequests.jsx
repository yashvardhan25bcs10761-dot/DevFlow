import React from 'react';
import WorkItemsPage from './WorkItemsPage';
import { useRepositoryLayout } from '../components/Navbar';

export default function PullRequests() {
  const { selectedRepo, refreshTick } = useRepositoryLayout();
  return <WorkItemsPage kind="pullRequests" repository={selectedRepo} refreshTick={refreshTick} />;
}
