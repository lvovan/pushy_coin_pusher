/**
 * MuteButton — top-of-UI toggle that mutes / unmutes the AudioBus.
 *
 * State is persisted to localStorage so the player's preference survives
 * reload. The button reflects the current mute state via its label.
 */
import type { AudioBus } from '../audio/AudioBus';

const STORAGE_KEY = 'pushy.muted.v1';
const ICON_AUDIBLE = '\u{1F50A}'; // 🔊
const ICON_MUTED = '\u{1F507}'; // 🔇

export class MuteButton {
  private readonly btn: HTMLButtonElement;

  constructor(parent: HTMLElement, private readonly audio: AudioBus) {
    this.btn = document.createElement('button');
    this.btn.className = 'mute-btn';
    this.btn.type = 'button';
    this.btn.setAttribute('aria-label', 'Toggle sound');
    this.btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      audio.resume();
      this.setMuted(!audio.isMuted);
    });
    parent.appendChild(this.btn);

    const persisted = this.readPersisted();
    this.setMuted(persisted);
  }

  private setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.btn.textContent = muted ? ICON_MUTED : ICON_AUDIBLE;
    this.btn.classList.toggle('is-muted', muted);
    this.writePersisted(muted);
  }

  private readPersisted(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writePersisted(muted: boolean): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // localStorage unavailable; silently ignore.
    }
  }

  dispose(): void {
    this.btn.remove();
  }
}
