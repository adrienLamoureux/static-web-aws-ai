import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { retryDirectorJob, cancelDirectorJob } from '../../services/operations';
import JobQueue from './JobQueue';
import { NotificationProvider } from '../../components/sakura/NotificationStack';

jest.mock('../../services/operations', () => ({
  prioritizeDirectorJob: jest.fn().mockResolvedValue({}),
  retryDirectorJob: jest.fn().mockResolvedValue({}),
  cancelDirectorJob: jest.fn().mockResolvedValue({}),
}));

const MOCK_JOBS = [
  { jobId: 'job-1', type: 'image', status: 'failed', priority: 'normal', createdAt: '2024-01-01T00:00:00Z', errorMessage: 'Model timeout' },
  { jobId: 'job-2', type: 'video', status: 'queued', priority: 'normal', createdAt: '2024-01-01T01:00:00Z' },
  { jobId: 'job-3', type: 'image', status: 'running', priority: 'high', createdAt: '2024-01-01T02:00:00Z' },
  { jobId: 'job-4', type: 'story', status: 'completed', priority: 'normal', createdAt: '2024-01-01T03:00:00Z' },
];

function renderQueue(props = {}) {
  return render(
    <NotificationProvider>
      <JobQueue
        apiBaseUrl="https://api.example.com"
        jobs={MOCK_JOBS}
        isLoading={false}
        onRefresh={jest.fn()}
        {...props}
      />
    </NotificationProvider>
  );
}

describe('JobQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state message when jobs array is empty', () => {
    renderQueue({ jobs: [] });
    expect(screen.getByText(/job queue is empty/i)).toBeInTheDocument();
  });

  it('renders filter chips for each status', () => {
    renderQueue();
    expect(screen.getByText(/all \(\d+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/failed \(\d+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/queued \(\d+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/running \(\d+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/completed \(\d+\)/i)).toBeInTheDocument();
  });

  it('filters jobs when a status chip is clicked', () => {
    renderQueue();
    fireEvent.click(screen.getByText(/failed \(1\)/i));
    expect(screen.getByText(/image/i)).toBeInTheDocument();
  });

  it('shows Retry button for failed jobs', () => {
    renderQueue();
    const retryButtons = screen.getAllByRole('button', { name: /retry/i });
    expect(retryButtons.length).toBeGreaterThan(0);
  });

  it('shows Cancel button for queued jobs', () => {
    renderQueue();
    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    expect(cancelButtons.length).toBeGreaterThan(0);
  });

  it('shows error message for failed jobs', () => {
    renderQueue();
    expect(screen.getByText(/model timeout/i)).toBeInTheDocument();
  });

  it('calls retryDirectorJob when Retry is clicked', async () => {
    const onRefresh = jest.fn();
    renderQueue({ onRefresh });
    const retryButton = screen.getAllByRole('button', { name: /retry/i })[0];
    fireEvent.click(retryButton);
    await waitFor(() => expect(retryDirectorJob).toHaveBeenCalledWith('https://api.example.com', { jobKey: 'job-1' }));
  });

  it('calls cancelDirectorJob when Cancel is clicked', async () => {
    const onRefresh = jest.fn();
    renderQueue({ onRefresh });
    const cancelButton = screen.getAllByRole('button', { name: /cancel/i })[0];
    fireEvent.click(cancelButton);
    await waitFor(() => expect(cancelDirectorJob).toHaveBeenCalled());
  });

  it('shows loading state', () => {
    renderQueue({ isLoading: true });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
