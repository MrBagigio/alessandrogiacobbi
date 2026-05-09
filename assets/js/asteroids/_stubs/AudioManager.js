/**
 * AudioManager stub — silent noop.
 *
 * Portfolio Giacobbi non vuole audio sul cursor (UX professional context,
 * suoni sparo/esplosione sarebbero fastidiosi nel browsing).
 * Se un giorno serve riabilitare audio: implementa qui Web Audio API.
 */
export class AudioManager {
  constructor() {
    this.muted = true;
  }

  onAudioPlay(/* { name } */) { /* noop */ }
  play(/* name */) { /* noop */ }
  setVolume(/* v */) { /* noop */ }
  mute() { this.muted = true; }
  unmute() { this.muted = false; }
}

export default AudioManager;
