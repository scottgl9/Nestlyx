import { render, screen } from '@testing-library/react';
import { VideoTile } from './video-tile';

// Mock the Avatar component so we can assert on its presence without
// depending on its internal markup.
jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ name }: { name: string }) => (
    <div data-testid="avatar">{name}</div>
  ),
}));

function createMockStream({ videoTracks = 1 }: { videoTracks?: number } = {}): MediaStream {
  const tracks = Array.from({ length: videoTracks }, () => ({
    kind: 'video' as const,
    id: crypto.randomUUID?.() ?? 'track-id',
    enabled: true,
  }));

  return {
    getVideoTracks: () => tracks,
    getAudioTracks: () => [],
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe('VideoTile', () => {
  it('renders a video element when stream has video tracks and isCameraOn is true', () => {
    const stream = createMockStream({ videoTracks: 1 });

    const { container } = render(
      <VideoTile
        stream={stream}
        displayName="Alice"
        isMuted={false}
        isCameraOn={true}
      />,
    );

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(screen.queryByTestId('avatar')).not.toBeInTheDocument();
  });

  it('renders avatar fallback when stream is null', () => {
    render(
      <VideoTile
        stream={null}
        displayName="Bob"
        isMuted={false}
        isCameraOn={true}
      />,
    );

    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('renders avatar fallback when isCameraOn is false', () => {
    const stream = createMockStream({ videoTracks: 1 });

    const { container } = render(
      <VideoTile
        stream={stream}
        displayName="Carol"
        isMuted={false}
        isCameraOn={false}
      />,
    );

    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('renders avatar fallback when stream has no video tracks', () => {
    const stream = createMockStream({ videoTracks: 0 });

    const { container } = render(
      <VideoTile
        stream={stream}
        displayName="Dave"
        isMuted={false}
        isCameraOn={true}
      />,
    );

    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('shows mute icon when isMuted is true', () => {
    const { container } = render(
      <VideoTile
        stream={null}
        displayName="Eve"
        isMuted={true}
        isCameraOn={false}
      />,
    );

    // The mute indicator is an SVG inside a red-tinted container.
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('does not show mute icon when isMuted is false', () => {
    const { container } = render(
      <VideoTile
        stream={null}
        displayName="Eve"
        isMuted={false}
        isCameraOn={false}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('shows BOT badge for bot participants', () => {
    render(
      <VideoTile
        stream={null}
        displayName="OpenClaw"
        isMuted={false}
        isCameraOn={false}
        isBot={true}
      />,
    );

    expect(screen.getByText('BOT')).toBeInTheDocument();
  });

  it('does not show BOT badge for non-bot participants', () => {
    render(
      <VideoTile
        stream={null}
        displayName="Alice"
        isMuted={false}
        isCameraOn={false}
        isBot={false}
      />,
    );

    expect(screen.queryByText('BOT')).not.toBeInTheDocument();
  });

  it('shows "You" label when isSelf is true', () => {
    render(
      <VideoTile
        stream={null}
        displayName="Alice"
        isMuted={false}
        isCameraOn={false}
        isSelf={true}
      />,
    );

    // The overlay label should read "You", not the display name.
    const label = screen.getByText('You');
    expect(label).toBeInTheDocument();
    expect(label.tagName).toBe('SPAN');
  });

  it('shows displayName when isSelf is false', () => {
    render(
      <VideoTile
        stream={null}
        displayName="Alice"
        isMuted={false}
        isCameraOn={false}
        isSelf={false}
      />,
    );

    // The overlay span should show the display name, not "You".
    const labels = screen.getAllByText('Alice');
    const overlayLabel = labels.find((el) => el.tagName === 'SPAN');
    expect(overlayLabel).toBeDefined();
    expect(screen.queryByText('You')).not.toBeInTheDocument();
  });
});
