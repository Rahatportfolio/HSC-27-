/** Read the selected SINGLE video's actual metadata in the student's browser.
 * No API key, proxy, scraping, invented duration, playlist-total guess or download.
 */
export interface DurationPlayer {
  getDuration: () => number;
  getVideoData: () => { video_id?: string; isLive?: boolean; isWindowedLive?: boolean; isLiveContent?: boolean };
  destroy: () => void;
}
interface YouTubeApi {
  Player: new (element: HTMLElement, options: { videoId: string; width: string; height: string; playerVars: Record<string, string | number>;
    events: { onReady: () => void; onStateChange: () => void; onError: () => void } }) => DurationPlayer;
}
declare global { interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void } }
let apiPromise: Promise<YouTubeApi> | null = null;
export function youtubeVideoId(raw: string): string | null {
  let url: URL; try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0]
    : host === 'youtube.com' ? url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname)?.[1] : null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
export function verifiedPlayerMinutes(player: DurationPlayer, expectedVideoId: string): number {
  const data = player.getVideoData(); const seconds = player.getDuration();
  // An archived live broadcast may have isLiveContent=true yet isLive=false.
  // Its finite VOD length is usable; an ongoing/windowed live stream is not.
  if (data.video_id !== expectedVideoId || data.isLive !== false || data.isWindowedLive || !Number.isFinite(seconds) || seconds <= 0 || seconds > 604800) throw new Error('Video duration unavailable, live, or not the selected video');
  return seconds / 60;
}
function loadApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => { apiPromise = null; reject(new Error('YouTube metadata connection timed out')); }, 20000);
    window.onYouTubeIframeAPIReady = () => { previous?.(); window.clearTimeout(timer); if (window.YT?.Player) resolve(window.YT); else { apiPromise = null; reject(new Error('YouTube player API unavailable')); } };
    let script = document.querySelector<HTMLScriptElement>('script[data-prostuti-youtube-api]');
    if (!script) { script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.dataset.prostutiYoutubeApi = 'true'; document.head.appendChild(script); }
    script.onerror = () => { window.clearTimeout(timer); apiPromise = null; script?.remove(); reject(new Error('YouTube metadata connection failed')); };
  });
  return apiPromise;
}
export async function inspectYouTubeDuration(raw: string, mount: HTMLElement, signal: AbortSignal): Promise<number> {
  const id = youtubeVideoId(raw);
  if (!id) throw new Error('Select a single YouTube video. A playlist/search has no verified chapter duration.');
  if (signal.aborted) throw new Error('Cancelled');
  const api = await loadApi();
  if (signal.aborted) throw new Error('Cancelled');
  return new Promise((resolve, reject) => {
    let player: DurationPlayer | undefined, settled = false;
    const cleanup = () => { window.clearInterval(poll); window.clearTimeout(timeout); signal.removeEventListener('abort', abort); try { player?.destroy(); } catch { /* A replaced/blocked iframe may already be gone. */ } mount.replaceChildren(); };
    const finish = (minutes?: number, error?: Error) => { if (settled) return; settled = true; cleanup(); if (error) reject(error); else resolve(minutes!); };
    const check = () => { if (!player) return; try { finish(verifiedPlayerMinutes(player, id)); } catch { /* Wait for the exact video's metadata, never substitute a guess. */ } };
    const abort = () => finish(undefined, new Error('Cancelled'));
    const poll = window.setInterval(check, 300);
    const timeout = window.setTimeout(() => finish(undefined, new Error('YouTube did not provide a usable duration. Open the video and enter its shown duration.')), 20000);
    signal.addEventListener('abort', abort, { once: true });
    // YouTube replaces the passed element. React owns mount, so pass a child that
    // the API may replace without invalidating React's own tree.
    const target = document.createElement('div'); mount.appendChild(target);
    try { player = new api.Player(target, { videoId: id, width: '100%', height: '180', playerVars: { autoplay: 0, controls: 1, playsinline: 1, origin: window.location.origin },
      events: { onReady: check, onStateChange: check, onError: () => finish(undefined, new Error('YouTube blocked this video/embedding. No duration was guessed.')) } });
      if (settled) { player.destroy(); mount.replaceChildren(); }
    }
    catch (error) { finish(undefined, error as Error); }
  });
}
