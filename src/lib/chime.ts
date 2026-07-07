// A bright, longer four-note chime synthesized with the Web Audio API (no
// audio asset needed) — loud and long enough that a customer walking up to
// the counter clearly hears the check-in succeeded.
export function playChime() {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 — rising major arpeggio
  const noteGap = 0.16;

  notes.forEach((freq, i) => {
    const start = ctx.currentTime + i * noteGap;
    const isLast = i === notes.length - 1;
    const duration = isLast ? 0.9 : 0.35;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);

    // A quiet octave-up overtone gives each note a brighter "bell" timbre.
    const overtone = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtone.type = "sine";
    overtone.frequency.value = freq * 2;
    overtoneGain.gain.setValueAtTime(0, start);
    overtoneGain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    overtone.connect(overtoneGain).connect(ctx.destination);
    overtone.start(start);
    overtone.stop(start + duration + 0.02);
  });

  const totalMs = ((notes.length - 1) * noteGap + 0.9 + 0.3) * 1000;
  setTimeout(() => ctx.close(), totalMs);
}

// Uses the browser's built-in text-to-speech voice for now — swap in a real
// recorded clip later by playing an <audio> element here instead.
export function sayHappyBirthday(name: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(`Happy birthday, ${name}!`);
  utterance.pitch = 1.4;
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
