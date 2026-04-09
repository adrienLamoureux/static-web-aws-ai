import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fetchFeatureFlags, saveFeatureFlags } from '../../services/operations';
import FeatureFlagsSection from './FeatureFlagsSection';
import { NotificationProvider } from '../../components/sakura/NotificationStack';

jest.mock('../../services/operations', () => ({
  fetchFeatureFlags: jest.fn(),
  saveFeatureFlags: jest.fn().mockResolvedValue({}),
}));

const ALL_TRUE_FLAGS = {
  enableStoryAnimations: true,
  enableCivitaiSync: true,
  enableNovaReelVideos: true,
  enableCompanionInitiative: true,
};

function renderSection(props = {}) {
  return render(
    <NotificationProvider>
      <FeatureFlagsSection apiBaseUrl="https://api.example.com" {...props} />
    </NotificationProvider>
  );
}

describe('FeatureFlagsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchFeatureFlags.mockResolvedValue({ flags: ALL_TRUE_FLAGS });
  });

  it('calls fetchFeatureFlags on mount', async () => {
    renderSection();
    await waitFor(() => expect(fetchFeatureFlags).toHaveBeenCalledWith('https://api.example.com'));
  });

  it('renders Story Animations flag after loading', async () => {
    renderSection();
    expect(await screen.findByText('Story Animations')).toBeInTheDocument();
  });

  it('renders CivitAI Sync flag after loading', async () => {
    renderSection();
    expect(await screen.findByText('CivitAI Sync')).toBeInTheDocument();
  });

  it('renders Nova Reel Videos flag after loading', async () => {
    renderSection();
    expect(await screen.findByText('Nova Reel Videos')).toBeInTheDocument();
  });

  it('renders Companion Initiative flag after loading', async () => {
    renderSection();
    expect(await screen.findByText('Companion Initiative')).toBeInTheDocument();
  });

  it('calls saveFeatureFlags with updated map when toggle is clicked', async () => {
    renderSection();
    await screen.findByText('Story Animations');

    const toggleButtons = screen.getAllByRole('button');
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => expect(saveFeatureFlags).toHaveBeenCalledWith(
      'https://api.example.com',
      expect.objectContaining({ flags: expect.any(Object) })
    ));

    const callArgs = saveFeatureFlags.mock.calls[0];
    const sentFlags = callArgs[1].flags;
    const flipCount = Object.keys(ALL_TRUE_FLAGS).filter(k => sentFlags[k] !== ALL_TRUE_FLAGS[k]).length;
    expect(flipCount).toBe(1);
  });

  it('shows description for Story Animations', async () => {
    renderSection();
    expect(await screen.findByText(/Allow scene animation generation/i)).toBeInTheDocument();
  });

  it('shows description for CivitAI Sync', async () => {
    renderSection();
    expect(await screen.findByText(/Allow syncing LoRA models/i)).toBeInTheDocument();
  });
});
